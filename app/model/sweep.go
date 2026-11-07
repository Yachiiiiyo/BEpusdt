package model

import (
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/v03413/bepusdt/app/utils"
	"gorm.io/gorm/clause"
)

// 归集状态机
const (
	SweepStatePending  = "pending"  // 刚入队
	SweepStateFunding  = "funding"  // 已广播补给交易，等确认
	SweepStateFunded   = "funded"   // 补给已确认
	SweepStateSweeping = "sweeping" // 已广播 USDT 转账，等确认
	SweepStateSwept    = "swept"    // USDT 已确认转出
	SweepStateDone     = "done"     // BNB 余额已回收或不值得回收
	SweepStateSkipped  = "skipped"  // 派生地址余额为 0
	SweepStateFailed   = "failed"   // 需人工处理，后台可手动重试
)

const sweepLasterrorLimit = 512

// Sweep HD 派生地址 USDT 归集记录
type Sweep struct {
	Id
	OrderId     string    `gorm:"column:order_id;type:varchar(128);not null;default:'';index;comment:商户订单号" json:"order_id"`
	TradeId     string    `gorm:"column:trade_id;type:varchar(128);not null;uniqueIndex;comment:本地订单ID" json:"trade_id"`
	DeriveIndex int64     `gorm:"column:derive_index;type:bigint;not null;default:0;comment:派生索引" json:"derive_index"`
	Address     string    `gorm:"column:address;type:varchar(128);not null;default:'';comment:EIP-55来源地址" json:"address"`
	DestAddress string    `gorm:"column:dest_address;type:varchar(128);not null;default:'';comment:创建时的归集目标地址" json:"dest_address"`
	State       string    `gorm:"column:state;type:varchar(32);not null;default:'pending';index;comment:状态" json:"state"`
	Amount      string    `gorm:"column:amount;type:varchar(64);not null;default:'';comment:转出USDT数量(最小单位)" json:"amount"`
	FundTx      string    `gorm:"column:fund_tx;type:varchar(128);not null;default:'';comment:补给交易哈希" json:"fund_tx"`
	SweepTx     string    `gorm:"column:sweep_tx;type:varchar(128);not null;default:'';comment:归集交易哈希" json:"sweep_tx"`
	ReturnTx    string    `gorm:"column:return_tx;type:varchar(128);not null;default:'';comment:回收交易哈希" json:"return_tx"`
	FundValue   string    `gorm:"column:fund_value;type:varchar(64);not null;default:'';comment:补给BNB数量(wei)" json:"fund_value"`
	Attempts    int       `gorm:"column:attempts;type:int;not null;default:0;comment:自动重试次数" json:"attempts"`
	ReturnTries int       `gorm:"column:return_tries;type:int;not null;default:0;comment:回收重试次数" json:"return_tries"`
	NextRetryAt *Datetime `gorm:"column:next_retry_at;comment:下次重试时间;index" json:"next_retry_at"`
	LastError   string    `gorm:"column:last_error;type:varchar(512);not null;default:'';comment:最后错误信息" json:"last_error"`
	AutoTimeAt
}

func (Sweep) TableName() string {
	return "bep_sweep"
}

type sweepState struct {
	enabled     bool
	destAddress string // 归集目标（小写）
	gasAddress  string // 气费账户 index 0 地址（小写）
	gasCapWei   *big.Int
}

// sweepCurrent 归集全局状态，测试中可通过 InitSweep 重置
var sweepCurrent sweepState

// InitSweep 解析归集配置环境变量，需在 InitHD 之后调用
func InitSweep() error {
	sweepCurrent = sweepState{}

	enabledRaw := strings.TrimSpace(strings.ToLower(os.Getenv("HD_SWEEP_ENABLED")))
	collectRaw := strings.TrimSpace(os.Getenv("HD_COLLECT_ADDRESS"))
	gasCapRaw := strings.TrimSpace(os.Getenv("HD_SWEEP_GAS_BNB"))

	hdEnabled := hdCurrent.derivator != nil

	var enabled bool
	switch enabledRaw {
	case "":
		enabled = IsHdTradeType(UsdtBep20)
	case "true":
		enabled = true
		if !hdEnabled {
			return errors.New("HD_SWEEP_ENABLED 已显式启用，但 HD 派生未启用（缺少 HD_MNEMONIC/HD_TRADE_TYPES）")
		}
	case "false":
		enabled = false
	default:
		return fmt.Errorf("HD_SWEEP_ENABLED 取值不合法：%s（仅支持 true/false）", enabledRaw)
	}

	if !enabled || !hdEnabled {
		return nil
	}

	h, _ := currentHD(UsdtBep20)
	if h == nil {
		// 显式启用但 usdt.bep20 不在 HD 派生类型里，没有可归集的订单，直接视为关闭
		return nil
	}

	_, gasLower, err := h.DeriveAddress(0)
	if err != nil {
		return fmt.Errorf("HD 归集气费地址派生失败：%w", err)
	}

	dest := gasLower
	if collectRaw != "" {
		if !utils.IsValidEvmAddress(collectRaw) {
			return errors.New("HD_COLLECT_ADDRESS 不是合法的 EVM 地址")
		}
		dest = strings.ToLower(collectRaw)
	}

	var gasCap *big.Int
	if gasCapRaw != "" {
		d, err := decimal.NewFromString(gasCapRaw)
		if err != nil || d.Sign() <= 0 {
			return fmt.Errorf("HD_SWEEP_GAS_BNB 不是合法的 BNB 数量：%s", gasCapRaw)
		}
		gasCap = d.Shift(18).BigInt()
	}

	sweepCurrent = sweepState{enabled: true, destAddress: dest, gasAddress: gasLower, gasCapWei: gasCap}

	return nil
}

func IsSweepEnabled() bool {
	return sweepCurrent.enabled
}

func SweepDestAddress() string {
	return sweepCurrent.destAddress
}

func SweepGasAddress() string {
	return sweepCurrent.gasAddress
}

func SweepGasCapWei() *big.Int {
	return sweepCurrent.gasCapWei
}

// SignHdLegacyTx 用当前助记词派生私钥并签名 legacy 交易，私钥仅在内存中临时存在
func SignHdLegacyTx(index uint32, tx utils.LegacyTx) (raw []byte, hash string, err error) {
	h, ok := currentHD(UsdtBep20)
	if !ok || h == nil {
		return nil, "", errors.New("HD 派生未启用，无法签名")
	}

	return h.SignLegacyTx(index, tx)
}

// HdAddressAt 派生地址（EIP-55 / 小写）
func HdAddressAt(index uint32) (string, string, error) {
	h, ok := currentHD(UsdtBep20)
	if !ok || h == nil {
		return "", "", errors.New("HD 派生未启用")
	}

	return h.DeriveAddress(index)
}

// HdKeyFingerprint 当前助记词指纹
func HdKeyFingerprint() string {
	if hdCurrent.derivator == nil {
		return ""
	}

	return hdCurrent.derivator.KeyFingerprint()
}

// EnqueueSweep 订单确认成功后入队归集，仅处理 usdt.bep20 且匹配当前助记词派生地址的订单。
// 不满足条件时返回 nil，入队失败由调用方记录日志，不影响订单确认和回调。
func EnqueueSweep(o Order) error {
	if !sweepCurrent.enabled {
		return nil
	}
	if o.TradeType != UsdtBep20 {
		return nil
	}
	if o.MatchAddress == "" {
		return nil
	}

	var record DerivedAddress
	res := Db.Where("match_addr = ? and key_fingerprint = ?", strings.ToLower(o.MatchAddress), HdKeyFingerprint()).
		Limit(1).Find(&record)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return nil
	}

	return EnqueueSweepByDerived(record, o.OrderId, o.TradeId)
}

// EnqueueSweepByDerived 按派生地址记录入队（供后台手动归集使用），trade_id 唯一索引保证幂等
func EnqueueSweepByDerived(record DerivedAddress, orderId, tradeId string) error {
	if !sweepCurrent.enabled {
		return errors.New("HD 归集未启用")
	}
	if record.KeyFingerprint != HdKeyFingerprint() {
		return errors.New("派生地址记录不属于当前助记词")
	}
	if tradeId == "" {
		tradeId = fmt.Sprintf("manual:%d", record.ID)
	}

	now := Datetime(time.Now())
	row := Sweep{
		OrderId:     orderId,
		TradeId:     tradeId,
		DeriveIndex: record.DeriveIndex,
		Address:     record.Address,
		DestAddress: sweepCurrent.destAddress,
		State:       SweepStatePending,
		NextRetryAt: &now,
	}

	return Db.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error
}

// RetrySweep 后台手动重试，仅 failed 状态可重置为 pending
func RetrySweep(id int64) error {
	var row Sweep
	if err := Db.Where("id = ?", id).Limit(1).Find(&row).Error; err != nil {
		return err
	}
	if row.ID == 0 {
		return errors.New("归集记录不存在")
	}
	if row.State != SweepStateFailed {
		return errors.New("仅失败的记录可重试")
	}

	now := Datetime(time.Now())

	return Db.Model(&Sweep{}).Where("id = ?", id).Updates(map[string]any{
		"state":         SweepStatePending,
		"attempts":      0,
		"next_retry_at": &now,
		"last_error":    "",
		"updated_at":    time.Now(),
	}).Error
}
