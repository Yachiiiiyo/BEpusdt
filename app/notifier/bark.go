package notifier

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/spf13/cast"
	"github.com/tidwall/gjson"
	"github.com/v03413/bepusdt/app"
	"github.com/v03413/bepusdt/app/conf"
	"github.com/v03413/bepusdt/app/log"
	"github.com/v03413/bepusdt/app/model"
	"github.com/v03413/bepusdt/app/utils"
	"github.com/v03413/tronprotocol/core"
)

const (
	barkDefaultServer = "https://api.day.app"
	barkDefaultGroup  = "BEpusdt"
	barkDefaultSound  = "chime"
)

type Bark struct {
	server    string
	deviceKey string
	group     string
	sound     string
	client    *http.Client
}

type barkMessage struct {
	DeviceKey string `json:"device_key"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Group     string `json:"group,omitempty"`
	Sound     string `json:"sound,omitempty"`
	URL       string `json:"url,omitempty"`
}

func (b *Bark) Initialize(params string) error {
	info := gjson.Parse(params)

	b.deviceKey = strings.TrimSpace(info.Get("device_key").String())
	if b.deviceKey == "" {
		return errors.New("bark device_key 不能为空")
	}

	b.server = strings.TrimRight(strings.TrimSpace(info.Get("server").String()), "/")
	if b.server == "" {
		b.server = barkDefaultServer
	}

	b.sound = strings.TrimSpace(info.Get("sound").String())
	if b.sound == "" {
		b.sound = barkDefaultSound
	}

	b.group = barkDefaultGroup
	b.client = &http.Client{Timeout: time.Second * 10}

	return nil
}

func (b *Bark) Success(o model.Order) {
	if o.Status != model.OrderStatusSuccess {
		return
	}

	tradeType := string(o.TradeType)
	if _, err := model.GetCrypto(o.TradeType); err != nil {
		b.sendLog("❌交易类型不支持："+tradeType, "", "")

		return
	}

	body := fmt.Sprintf("🚦商户订单：%v\n💰请求金额：%v %s(%v)\n💲支付数额：%v %s\n💎交易哈希：%s\n✅收款地址：%s\n⏱️创建时间：%s\n🎯支付时间：%s",
		o.OrderId,
		o.Money, string(o.Fiat), o.Rate,
		o.Amount, tradeType,
		utils.MaskHash(o.RefHash),
		utils.MaskAddress(o.Address),
		o.CreatedAt.Format(time.DateTime),
		o.UpdatedAt.Format(time.DateTime),
	)

	b.sendLog("收款成功", body, o.GetTxUrl())
}

func (b *Bark) NotifyFail(o model.Order, reason string) {
	tradeType := string(o.TradeType)
	if _, err := model.GetCrypto(o.TradeType); err != nil {
		b.sendLog("❌交易类型不支持："+tradeType, "", "")

		return
	}

	body := fmt.Sprintf("🚦商户订单：%v\n💲支付数额：%v\n💰请求金额：%v %s(%v)\n💍交易类别：%s\n⚖️确认时间：%s\n⏰下次回调：%s\n🗒️失败原因：%s",
		o.OrderId,
		o.Amount,
		o.Money, string(o.Fiat), o.Rate,
		strings.ToUpper(tradeType),
		o.ConfirmedAt.Format(time.DateTime),
		utils.CalcNextNotifyTime(*o.ConfirmedAt, o.NotifyNum+1).Format(time.DateTime),
		reason,
	)

	b.sendLog("回调失败", body, o.GetTxUrl())
}

func (b *Bark) NonOrderTransfer(trans model.TronTransfer, wa model.Wallet) {
	body := fmt.Sprintf("💲交易数额：%v\n💍交易类别：%s\n⏱️交易时间：%v\n✅接收地址：%v\n🅾️发送地址：%v",
		trans.Amount.String(),
		strings.ToUpper(string(trans.TradeType)),
		trans.Timestamp.Format(time.DateTime),
		utils.MaskAddress(trans.RecvAddress),
		utils.MaskAddress(trans.FromAddress),
	)

	b.sendLog("账户"+nonOrderTransferTitle(trans, wa)+"（非订单交易）", body, model.GetTxUrl(trans.TradeType, trans.TxHash))
}

func (b *Bark) TronResourceChange(res model.TronResource) {
	title := "代理"
	if res.Type == core.Transaction_Contract_UnDelegateResourceContract {
		title = "回收"
	}

	body := fmt.Sprintf("🔋质押数量：%s\n⏱️交易时间：%v\n✅操作地址：%v\n🅾️资源来源：%v",
		cast.ToString(res.Balance/1000000),
		res.Timestamp.Format(time.DateTime),
		utils.MaskAddress(res.RecvAddress),
		utils.MaskAddress(res.FromAddress),
	)

	b.sendLog("资源动态（能量"+title+"）", body, "https://tronscan.org/#/transaction/"+res.ID)
}

func (b *Bark) Welcome() {
	body := "👋 欢迎使用 BEpusdt，" + conf.Desc + "，如果您看到此消息，说明系统已启动成功！\n\n📌当前版本：" + app.Version + "\n🎉开源地址：" + conf.Github

	b.sendLog("欢迎使用 BEpusdt", body, conf.Github)
}

func (b *Bark) Test() error {
	return b.send("测试通知", "✅ 这是一条测试消息，Bark 通知配置成功！\n当前系统时间："+time.Now().Format(time.DateTime), "")
}

func (b *Bark) sendLog(title, body, url string) {
	if err := b.send(title, body, url); err != nil {
		log.Warn("Bark Send Message Error:", err.Error())
	}
}

func (b *Bark) send(title, body, url string) error {
	data, err := json.Marshal(barkMessage{
		DeviceKey: b.deviceKey,
		Title:     title,
		Body:      body,
		Group:     b.group,
		Sound:     b.sound,
		URL:       url,
	})
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.server+"/push", bytes.NewReader(data))
	if err != nil {
		return errors.New("bark 请求创建失败")
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := b.client.Do(req)
	if err != nil {
		// url.Error 含请求地址，这里不包含 device_key，但统一只返回底层错误
		var ue interface{ Unwrap() error }
		if errors.As(err, &ue) && ue.Unwrap() != nil {
			err = ue.Unwrap()
		}

		return err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bark 响应异常：HTTP %d %s", resp.StatusCode, gjson.GetBytes(raw, "message").String())
	}

	if code := gjson.GetBytes(raw, "code"); code.Exists() && code.Int() != 200 {
		return fmt.Errorf("bark 响应异常：code %d %s", code.Int(), gjson.GetBytes(raw, "message").String())
	}

	return nil
}
