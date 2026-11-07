package task

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/tidwall/gjson"
	"github.com/tyler-smith/go-bip39"
	applog "github.com/v03413/bepusdt/app/log"
	"github.com/v03413/bepusdt/app/model"
	"github.com/v03413/bepusdt/app/utils"
)

// ---------- mock BSC 节点：有状态的内存账本 ----------

type mockBscNode struct {
	mu       sync.Mutex
	server   *httptest.Server
	gasPrice *big.Int

	bnb      map[string]*big.Int // 地址 -> BNB 余额（wei）
	usdt     map[string]*big.Int // 地址 -> USDT 余额（最小单位）
	nonces   map[string]uint64
	receipts map[string]int // 交易哈希 -> 1 成功 / 0 失败

	token    string
	sweepTx  int // 已上链的 USDT transfer 笔数
	fundTx   int // 补给（气费账户->派生地址 BNB 转账）笔数
	failSend bool
}

func newMockBscNode(t *testing.T, gasPrice *big.Int) *mockBscNode {
	t.Helper()

	node := &mockBscNode{
		gasPrice: gasPrice,
		bnb:      make(map[string]*big.Int),
		usdt:     make(map[string]*big.Int),
		nonces:   make(map[string]uint64),
		receipts: make(map[string]int),
		token:    strings.ToLower("0x55d398326f99059ff775485246999027b3197955"),
	}
	node.server = httptest.NewServer(http.HandlerFunc(node.handle))
	t.Cleanup(node.server.Close)

	return node
}

func (n *mockBscNode) url() string {
	return n.server.URL + "/"
}

func (n *mockBscNode) setBnb(addr string, wei int64) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.bnb[strings.ToLower(addr)] = big.NewInt(wei)
}

func (n *mockBscNode) setUsdt(addr string, amount int64) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.usdt[strings.ToLower(addr)] = big.NewInt(amount)
}

func (n *mockBscNode) getUsdt(addr string) int64 {
	n.mu.Lock()
	defer n.mu.Unlock()
	v := n.usdt[strings.ToLower(addr)]
	if v == nil {
		return 0
	}

	return v.Int64()
}

func (n *mockBscNode) getBnb(addr string) int64 {
	n.mu.Lock()
	defer n.mu.Unlock()
	v := n.bnb[strings.ToLower(addr)]
	if v == nil {
		return 0
	}

	return v.Int64()
}

func (n *mockBscNode) sweepTxCount() int {
	n.mu.Lock()
	defer n.mu.Unlock()

	return n.sweepTx
}

func (n *mockBscNode) fundTxCount() int {
	n.mu.Lock()
	defer n.mu.Unlock()

	return n.fundTx
}

func (n *mockBscNode) handle(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Method string            `json:"method"`
		Params []json.RawMessage `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(400)

		return
	}

	var result any
	switch body.Method {
	case "eth_chainId":
		result = "0x38"
	case "eth_gasPrice":
		result = "0x" + n.gasPrice.Text(16)
	case "eth_getBalance":
		addr := strings.ToLower(strings.Trim(gjson.Parse(string(body.Params[0])).Raw, `"`))
		n.mu.Lock()
		v := n.bnb[addr]
		n.mu.Unlock()
		if v == nil {
			v = new(big.Int)
		}
		result = "0x" + v.Text(16)
	case "eth_getTransactionCount":
		addr := strings.ToLower(strings.Trim(gjson.Parse(string(body.Params[0])).Raw, `"`))
		n.mu.Lock()
		nonce := n.nonces[addr]
		n.mu.Unlock()
		result = fmt.Sprintf("0x%x", nonce)
	case "eth_call":
		call := gjson.Parse(string(body.Params[0]))
		data := strings.ToLower(call.Get("data").String())
		if strings.HasPrefix(data, "0x70a08231") {
			// calldata = selector(4) + 32字节左填充地址，owner 取末 40 个 hex 字符
			owner := strings.ToLower("0x" + data[len(data)-40:])
			n.mu.Lock()
			v := n.usdt[owner]
			n.mu.Unlock()
			if v == nil {
				v = new(big.Int)
			}
			result = "0x" + fmt.Sprintf("%064x", v.Int64())

			break
		}
		result = "0x"
	case "eth_estimateGas":
		result = "0xc350" // 50000
	case "eth_sendRawTransaction":
		rawHex := strings.Trim(gjson.Parse(string(body.Params[0])).Raw, `"`)
		raw, err := hex.DecodeString(strings.TrimPrefix(rawHex, "0x"))
		if err != nil {
			writeRpcError(w, -32000, "raw tx decode failed")

			return
		}
		if err := n.applyTx(raw); err != nil {
			writeRpcError(w, -32000, err.Error())

			return
		}
		result = "0x" + hex.EncodeToString(utils.Keccak256(raw))
	case "eth_getTransactionReceipt":
		hash := strings.ToLower(strings.Trim(gjson.Parse(string(body.Params[0])).Raw, `"`))
		n.mu.Lock()
		status, ok := n.receipts[hash]
		n.mu.Unlock()
		if !ok {
			result = nil

			break
		}
		if status == 1 {
			result = map[string]any{"status": "0x1", "transactionHash": hash}
		} else {
			result = map[string]any{"status": "0x0", "transactionHash": hash}
		}
	default:
		writeRpcError(w, -32601, "method not found: "+body.Method)

		return
	}

	_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
}

func writeRpcError(w http.ResponseWriter, code int, msg string) {
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jsonrpc": "2.0", "id": 1,
		"error": map[string]any{"code": code, "message": msg},
	})
}

// applyTx 校验并应用一笔 legacy 交易，更新 mock 状态
func (n *mockBscNode) applyTx(raw []byte) error {
	tx, err := utils.DecodeLegacyTx(raw)
	if err != nil {
		return err
	}
	sender, err := utils.RecoverLegacyTxSender(raw)
	if err != nil {
		return err
	}

	n.mu.Lock()
	defer n.mu.Unlock()
	if n.failSend {
		return fmt.Errorf("mock broadcast disabled")
	}

	to := "0x" + hex.EncodeToString(tx.To)
	gasCost := new(big.Int).Mul(tx.GasPrice, new(big.Int).SetUint64(tx.Gas))
	balance := n.bnb[sender]
	if balance == nil {
		balance = new(big.Int)
	}
	if new(big.Int).Add(gasCost, tx.Value).Cmp(balance) > 0 {
		return fmt.Errorf("insufficient bnb balance")
	}

	hash := "0x" + hex.EncodeToString(utils.Keccak256(raw))

	// BNB 变动
	n.bnb[sender] = new(big.Int).Sub(balance, gasCost)
	if v, ok := n.bnb[to]; ok {
		n.bnb[to] = new(big.Int).Add(v, tx.Value)
	} else {
		n.bnb[to] = new(big.Int).Set(tx.Value)
	}
	n.nonces[sender]++

	// USDT transfer
	if strings.EqualFold(to, n.token) && len(tx.Data) == 68 && hex.EncodeToString(tx.Data[:4]) == "a9059cbb" {
		recipient := "0x" + hex.EncodeToString(tx.Data[16:36])
		amount := new(big.Int).SetBytes(tx.Data[36:68])
		from := n.usdt[sender]
		if from == nil {
			from = new(big.Int)
		}
		n.usdt[sender] = new(big.Int).Sub(from, amount)
		if v, ok := n.usdt[recipient]; ok {
			n.usdt[recipient] = new(big.Int).Add(v, amount)
		} else {
			n.usdt[recipient] = new(big.Int).Set(amount)
		}
		n.sweepTx++
	} else if tx.Value.Sign() > 0 {
		// 原生 BNB 转账：判断补给 or 回收由测试断言计数
		n.fundTx++
	}

	n.receipts[hash] = 1

	return nil
}

// ---------- sweep 测试环境 ----------

func sweepSetup(t *testing.T, mnemonic string, bnbGas int64) (*mockBscNode, string, string, string) {
	t.Helper()

	// 临时日志 + 数据库
	if err := applog.Init(t.TempDir()); err != nil {
		t.Fatalf("init log: %v", err)
	}
	t.Cleanup(applog.Close)
	if err := model.Init(t.TempDir()+"/sweep-test.db", ""); err != nil {
		t.Fatalf("init db: %v", err)
	}
	t.Cleanup(func() {
		if db, err := model.Db.DB(); err == nil {
			_ = db.Close()
		}
	})

	// HD + 归集配置
	t.Setenv("HD_MNEMONIC", mnemonic)
	t.Setenv("HD_TRADE_TYPES", "usdt.bep20")
	t.Setenv("HD_SWEEP_ENABLED", "")
	t.Setenv("HD_COLLECT_ADDRESS", "")
	t.Setenv("HD_SWEEP_GAS_BNB", "")
	t.Cleanup(func() {
		_ = os.Setenv("HD_MNEMONIC", "")
		_ = os.Setenv("HD_TRADE_TYPES", "")
		_ = os.Setenv("HD_SWEEP_ENABLED", "")
		_ = os.Setenv("HD_COLLECT_ADDRESS", "")
		_ = os.Setenv("HD_SWEEP_GAS_BNB", "")
		_ = model.InitHD()
		_ = model.InitSweep()
	})
	if err := model.InitHD(); err != nil {
		t.Fatalf("init hd: %v", err)
	}

	mock := newMockBscNode(t, big.NewInt(2_000_000_000)) // 2 gwei

	// RPC 指向 mock
	model.Db.Model(&model.Conf{}).Where("k = ?", model.RpcEndpointBsc).Update("v", mock.url())
	model.RefreshC()
	if err := model.InitSweep(); err != nil {
		t.Fatalf("init sweep: %v", err)
	}

	// 气费账户（index 0）预置 BNB
	gasAddress := model.SweepGasAddress()
	mock.setBnb(gasAddress, bnbGas)

	// 建派生地址记录（index 1）
	_, lower, err := model.HdAddressAt(1)
	if err != nil {
		t.Fatalf("derive 1: %v", err)
	}
	hd := model.HdKeyFingerprint()
	record := model.DerivedAddress{
		DeriveIndex:    1,
		KeyFingerprint: hd,
		Address:        "",
		MatchAddr:      lower,
		TradeType:      model.UsdtBep20,
		OrderId:        "order-1",
	}
	// EIP-55 地址：从 SignHdLegacyTx 恢复太绕，直接用小写（表字段允许）
	record.Address = lower
	if err := model.Db.Create(&record).Error; err != nil {
		t.Fatalf("create derived: %v", err)
	}

	return mock, lower, record.Address, model.SweepDestAddress()
}

func sweepNewMnemonic(t *testing.T) string {
	t.Helper()

	entropy, err := bip39.NewEntropy(128)
	if err != nil {
		t.Fatalf("entropy: %v", err)
	}
	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		t.Fatalf("mnemonic: %v", err)
	}

	return mnemonic
}

// runSweepUntil 反复执行 sweepRun 直至状态达到 want 或超时
func runSweepUntil(t *testing.T, id int64, want string, maxRounds int) model.Sweep {
	t.Helper()

	var row model.Sweep
	for i := 0; i < maxRounds; i++ {
		sweepRun(context.Background())
		if err := model.Db.Where("id = ?", id).First(&row).Error; err != nil {
			t.Fatalf("load sweep: %v", err)
		}
		if row.State == want {
			return row
		}
		time.Sleep(20 * time.Millisecond)
	}
	// 再读一次用于错误输出
	_ = model.Db.Where("id = ?", id).First(&row).Error

	return row
}

func loadSweep(t *testing.T, id int64) model.Sweep {
	t.Helper()

	var row model.Sweep
	if err := model.Db.Where("id = ?", id).First(&row).Error; err != nil {
		t.Fatalf("load sweep: %v", err)
	}

	return row
}

func enqueueSweepOrder(t *testing.T, derivedAddr, tradeId string) int64 {
	t.Helper()

	now := time.Now()
	at := model.Datetime(now)
	order := model.Order{
		OrderId:      "order-1",
		TradeId:      tradeId,
		TradeType:    model.UsdtBep20,
		Status:       model.OrderStatusConfirming,
		Address:      derivedAddr,
		MatchAddress: strings.ToLower(derivedAddr),
	}
	order.ConfirmedAt = &now
	order.ExpiredAt = now.Add(time.Hour)
	order.AutoTimeAt = model.AutoTimeAt{CreatedAt: &at, UpdatedAt: &at}
	if err := model.Db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}
	if err := model.EnqueueSweep(order); err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	return order.ID
}

// 加速时间参数的还原
func fastSweepTimers(t *testing.T) {
	t.Helper()

	oldTimeout, oldDefer, oldBackoff := sweepReceiptTimeout, sweepGasDeferDelay, sweepBackoffUnit
	sweepReceiptTimeout = 50 * time.Millisecond
	sweepGasDeferDelay = 100 * time.Millisecond
	sweepBackoffUnit = 10 * time.Millisecond
	t.Cleanup(func() {
		sweepReceiptTimeout = oldTimeout
		sweepGasDeferDelay = oldDefer
		sweepBackoffUnit = oldBackoff
	})
}

// ---------- 测试 ----------

func TestSweepFullFlow(t *testing.T) {
	fastSweepTimers(t)
	mock, lower, addr, dest := sweepSetup(t, sweepNewMnemonic(t), 1_000_000_000_000_000_000) // 气费账户 1 BNB

	// 派生地址有 USDT，无 BNB
	amount := int64(123_450_000_000_000_0000)
	mock.setUsdt(lower, amount)

	enqueueSweepOrder(t, addr, "trade-1")

	var row model.Sweep
	if err := model.Db.Where("trade_id = ?", "trade-1").First(&row).Error; err != nil {
		t.Fatalf("load sweep: %v", err)
	}

	final := runSweepUntil(t, row.ID, model.SweepStateDone, 50)
	if final.State != model.SweepStateDone {
		t.Fatalf("state = %s, want done: %+v", final.State, final)
	}

	// 派生地址 USDT 归零，dest 收到全部金额
	if got := mock.getUsdt(lower); got != 0 {
		t.Fatalf("derived usdt = %d, want 0", got)
	}
	if got := mock.getUsdt(dest); got != amount {
		t.Fatalf("dest usdt = %d, want %d", got, amount)
	}
	if dest != model.SweepGasAddress() {
		t.Fatalf("dest should equal gas address by default: %s", dest)
	}

	// 幂等：done 后再跑多轮不会重复转账
	for i := 0; i < 3; i++ {
		sweepRun(context.Background())
	}
	if mock.sweepTxCount() != 1 {
		t.Fatalf("usdt transfer count = %d, want 1", mock.sweepTxCount())
	}
	if final.Amount != fmt.Sprintf("%d", amount) || final.SweepTx == "" || final.FundTx == "" {
		t.Fatalf("unexpected final row: %+v", final)
	}

	_ = addr
}

func TestSweepIdempotentRepeat(t *testing.T) {
	fastSweepTimers(t)
	mock, lower, addr, _ := sweepSetup(t, sweepNewMnemonic(t), 1_000_000_000_000_000_000)

	amount := int64(55_000_000_000_000_0000)
	mock.setUsdt(lower, amount)

	enqueueSweepOrder(t, addr, "trade-2")

	var row model.Sweep
	if err := model.Db.Where("trade_id = ?", "trade-2").First(&row).Error; err != nil {
		t.Fatalf("load sweep: %v", err)
	}

	// 同一 trade_id 重复入队只有一条记录（订单本身已存在，直接重新入队即可）
	var existing model.Order
	if err := model.Db.Where("trade_id = ?", "trade-2").First(&existing).Error; err == nil {
		if err := model.EnqueueSweep(existing); err != nil {
			t.Fatalf("enqueue existing: %v", err)
		}
	} else {
		t.Fatalf("order should exist")
	}
	var count int64
	model.Db.Model(&model.Sweep{}).Where("trade_id = ?", "trade-2").Count(&count)
	if count != 1 {
		t.Fatalf("sweep rows = %d, want 1", count)
	}

	final := runSweepUntil(t, row.ID, model.SweepStateSweeping, 50)
	if final.State != model.SweepStateSweeping {
		t.Fatalf("state = %s, want sweeping", final.State)
	}

	// 转账已上链但状态仍是 sweeping：把 updated_at 拨到超时之后，重跑会重读余额
	past := time.Now().Add(-time.Hour)
	model.Db.Model(&model.Sweep{}).Where("id = ?", row.ID).Update("updated_at", model.Datetime(past))
	model.Db.Model(&model.Sweep{}).Where("id = ?", row.ID).Update("next_retry_at", past)

	final = runSweepUntil(t, row.ID, model.SweepStateDone, 50)
	if final.State != model.SweepStateDone {
		t.Fatalf("state = %s, want done", final.State)
	}
	if mock.sweepTxCount() != 1 {
		t.Fatalf("usdt transfer count = %d, want 1", mock.sweepTxCount())
	}
	if mock.getUsdt(lower) != 0 {
		t.Fatalf("derived usdt should be 0")
	}
}

func TestSweepGasAccountShortage(t *testing.T) {
	fastSweepTimers(t)
	mock, lower, addr, _ := sweepSetup(t, sweepNewMnemonic(t), 0) // 气费账户没有 BNB

	mock.setUsdt(lower, 10_000_000_000_000_0000)

	enqueueSweepOrder(t, addr, "trade-3")

	var row model.Sweep
	if err := model.Db.Where("trade_id = ?", "trade-3").First(&row).Error; err != nil {
		t.Fatalf("load sweep: %v", err)
	}

	sweepRun(context.Background())
	after := loadSweep(t, row.ID)
	if after.State != model.SweepStatePending {
		t.Fatalf("state = %s, want pending", after.State)
	}
	if !strings.Contains(after.LastError, "主地址 BNB 不足") {
		t.Fatalf("last error: %s", after.LastError)
	}
	if after.NextRetryAt == nil || after.NextRetryAt.Time().Before(time.Now()) {
		t.Fatalf("next retry should be deferred: %+v", after.NextRetryAt)
	}
	if mock.fundTxCount() != 0 {
		t.Fatalf("no tx should be sent")
	}

	// 给气费账户充值后流程恢复
	mock.setBnb(model.SweepGasAddress(), 1_000_000_000_000_000_000)
	model.Db.Model(&model.Sweep{}).Where("id = ?", row.ID).Update("next_retry_at", model.Datetime(time.Now()))

	final := runSweepUntil(t, row.ID, model.SweepStateDone, 50)
	if final.State != model.SweepStateDone {
		t.Fatalf("state = %s, want done", final.State)
	}
	if mock.getUsdt(lower) != 0 {
		t.Fatalf("derived usdt should be 0")
	}
}

func TestSweepGasCapTooSmall(t *testing.T) {
	fastSweepTimers(t)
	mock, lower, addr, _ := sweepSetup(t, sweepNewMnemonic(t), 1_000_000_000_000_000_000)

	// 设置一个极小的补给上限
	t.Setenv("HD_SWEEP_GAS_BNB", "0.000000000001")
	if err := model.InitSweep(); err != nil {
		t.Fatalf("init sweep: %v", err)
	}

	mock.setUsdt(lower, 10_000_000_000_000_0000)
	enqueueSweepOrder(t, addr, "trade-4")

	var row model.Sweep
	if err := model.Db.Where("trade_id = ?", "trade-4").First(&row).Error; err != nil {
		t.Fatalf("load sweep: %v", err)
	}

	sweepRun(context.Background())
	after := loadSweep(t, row.ID)
	if after.State != model.SweepStateFailed {
		t.Fatalf("state = %s, want failed", after.State)
	}
	if !strings.Contains(after.LastError, "HD_SWEEP_GAS_BNB") {
		t.Fatalf("last error: %s", after.LastError)
	}
	if mock.fundTxCount()+mock.sweepTxCount() != 0 {
		t.Fatalf("no tx should be sent")
	}

	// 后台重试：failed → pending
	if err := model.RetrySweep(row.ID); err != nil {
		t.Fatalf("retry: %v", err)
	}
	retried := loadSweep(t, row.ID)
	if retried.State != model.SweepStatePending || retried.Attempts != 0 || retried.LastError != "" {
		t.Fatalf("unexpected retried: %+v", retried)
	}
}

func TestSweepZeroBalanceSkipped(t *testing.T) {
	fastSweepTimers(t)
	mock, lower, addr, _ := sweepSetup(t, sweepNewMnemonic(t), 1_000_000_000_000_000_000)

	enqueueSweepOrder(t, addr, "trade-5")

	var row model.Sweep
	if err := model.Db.Where("trade_id = ?", "trade-5").First(&row).Error; err != nil {
		t.Fatalf("load sweep: %v", err)
	}

	sweepRun(context.Background())
	after := loadSweep(t, row.ID)
	if after.State != model.SweepStateSkipped {
		t.Fatalf("state = %s, want skipped", after.State)
	}
	if mock.sweepTxCount() != 0 {
		t.Fatalf("no usdt transfer expected")
	}
	_ = lower
}

func TestMarkFinalConfirmedSweepEnqueue(t *testing.T) {
	fastSweepTimers(t)
	mock, lower, addr, _ := sweepSetup(t, sweepNewMnemonic(t), 1_000_000_000_000_000_000)
	mock.setUsdt(lower, 1_000_000_000_000_000_000)

	notifySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	t.Cleanup(notifySrv.Close)

	// 正常路径：确认成功后入队
	o := model.Order{
		OrderId:      "order-1",
		TradeId:      "trade-6",
		TradeType:    model.UsdtBep20,
		Status:       model.OrderStatusConfirming,
		Address:      addr,
		MatchAddress: strings.ToLower(addr),
		NotifyUrl:    notifySrv.URL + "/notify",
		ApiType:      model.OrderApiTypeEpusdt,
	}
	now := time.Now()
	at := model.Datetime(now)
	o.ConfirmedAt = &now
	o.ExpiredAt = now.Add(time.Hour)
	o.CreatedAt = &at
	o.UpdatedAt = &at
	if err := model.Db.Create(&o).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	markFinalConfirmed(o)
	waitOrderNotified(t, o.TradeId)

	var order model.Order
	if err := model.Db.Where("id = ?", o.ID).First(&order).Error; err != nil {
		t.Fatalf("load order: %v", err)
	}
	if order.Status != model.OrderStatusSuccess {
		t.Fatalf("order status = %d, want success", order.Status)
	}
	var count int64
	model.Db.Model(&model.Sweep{}).Where("trade_id = ?", "trade-6").Count(&count)
	if count != 1 {
		t.Fatalf("sweep rows = %d, want 1", count)
	}

	// 非 usdt.bep20 订单不入队
	other := model.Order{
		NotifyUrl: notifySrv.URL + "/notify", ApiType: model.OrderApiTypeEpusdt,
		OrderId: "o7", TradeId: "trade-7", TradeType: model.UsdtTrc20,
		Status: model.OrderStatusConfirming, MatchAddress: strings.ToLower(addr),
	}
	other.ConfirmedAt = &now
	other.ExpiredAt = now.Add(time.Hour)
	other.AutoTimeAt = model.AutoTimeAt{CreatedAt: &at, UpdatedAt: &at}
	if err := model.Db.Create(&other).Error; err != nil {
		t.Fatalf("create other: %v", err)
	}
	markFinalConfirmed(other)
	waitOrderNotified(t, other.TradeId)
	model.Db.Model(&model.Sweep{}).Where("trade_id = ?", "trade-7").Count(&count)
	if count != 0 {
		t.Fatalf("trc20 should not enqueue: %d", count)
	}

	// 不在派生表里的订单不入队
	unknown := model.Order{
		NotifyUrl: notifySrv.URL + "/notify", ApiType: model.OrderApiTypeEpusdt,
		OrderId: "o8", TradeId: "trade-8", TradeType: model.UsdtBep20,
		Status: model.OrderStatusConfirming, MatchAddress: "0x2222222222222222222222222222222222222222",
	}
	unknown.ConfirmedAt = &now
	unknown.ExpiredAt = now.Add(time.Hour)
	unknown.AutoTimeAt = model.AutoTimeAt{CreatedAt: &at, UpdatedAt: &at}
	if err := model.Db.Create(&unknown).Error; err != nil {
		t.Fatalf("create unknown: %v", err)
	}
	markFinalConfirmed(unknown)
	waitOrderNotified(t, unknown.TradeId)
	model.Db.Model(&model.Sweep{}).Where("trade_id = ?", "trade-8").Count(&count)
	if count != 0 {
		t.Fatalf("unknown match addr should not enqueue: %d", count)
	}

	// 归集未启用：订单确认不受影响，不入队
	t.Setenv("HD_SWEEP_ENABLED", "false")
	if err := model.InitSweep(); err != nil {
		t.Fatalf("disable sweep: %v", err)
	}
	disabled := model.Order{
		NotifyUrl: notifySrv.URL + "/notify", ApiType: model.OrderApiTypeEpusdt,
		OrderId: "o9", TradeId: "trade-9", TradeType: model.UsdtBep20,
		Status: model.OrderStatusConfirming, MatchAddress: strings.ToLower(addr),
	}
	disabled.ConfirmedAt = &now
	disabled.ExpiredAt = now.Add(time.Hour)
	disabled.AutoTimeAt = model.AutoTimeAt{CreatedAt: &at, UpdatedAt: &at}
	if err := model.Db.Create(&disabled).Error; err != nil {
		t.Fatalf("create disabled: %v", err)
	}
	markFinalConfirmed(disabled)
	waitOrderNotified(t, disabled.TradeId)
	var disabledOrder model.Order
	_ = model.Db.Where("id = ?", disabled.ID).First(&disabledOrder).Error
	if disabledOrder.Status != model.OrderStatusSuccess {
		t.Fatalf("order status should still be success: %d", disabledOrder.Status)
	}
	model.Db.Model(&model.Sweep{}).Where("trade_id = ?", "trade-9").Count(&count)
	if count != 0 {
		t.Fatalf("disabled sweep should not enqueue: %d", count)
	}
}
