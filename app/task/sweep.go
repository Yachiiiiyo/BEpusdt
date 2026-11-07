package task

import (
	"context"
	"fmt"
	"math"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/v03413/bepusdt/app/conf"
	"github.com/v03413/bepusdt/app/log"
	"github.com/v03413/bepusdt/app/model"
	"github.com/v03413/bepusdt/app/utils"
)

// HD 归集：把派生地址上确认收款后的 USDT 自动转到归集目标地址。
// 单 worker 串行处理，避免气费账户（index 0）并发发交易导致 nonce 冲突。

const (
	sweepBatchLimit     = 20 // 单轮最多处理条数
	sweepDuration       = time.Second * 15
	sweepFundGas        = uint64(21000) // 补给 / 回收固定使用普通转账 gas
	sweepMaxAttempts    = 8             // 超过后置 failed
	sweepMaxReturnTries = 3             // 回收 BNB 最多重试次数
	sweepBscChainID     = uint64(56)
)

// 时间参数收敛为变量，测试中可覆盖
var (
	sweepReceiptTimeout = 10 * time.Minute // 交易广播后未见回执的回退时间
	sweepGasDeferDelay  = 5 * time.Minute  // 气费账户 BNB 不足时的推迟时间
	sweepBackoffUnit    = time.Minute      // 失败退避基本单位
)

var sweepMu sync.Mutex

func sweepInit() {
	if !model.IsSweepEnabled() {
		return
	}

	Register(Task{Callback: sweepRun, Duration: sweepDuration})
}

func sweepRun(ctx context.Context) {
	sweepMu.Lock()
	defer sweepMu.Unlock()

	var records []model.Sweep
	err := model.Db.Where("state in (?)", sweepActiveStates()).
		Where("next_retry_at <= ?", time.Now()).
		Order("id asc").Limit(sweepBatchLimit).Find(&records).Error
	if err != nil {
		log.Task.Warn("HD 归集：记录读取失败：", err)

		return
	}
	if len(records) == 0 {
		return
	}

	rpc := utils.NewEvmRpc(model.Endpoint(conf.Bsc), utils.NewHttpClient())
	for i := range records {
		select {
		case <-ctx.Done():
			return
		default:
		}

		sweepStep(ctx, rpc, &records[i])
	}
}

func sweepActiveStates() []string {
	return []string{
		model.SweepStatePending,
		model.SweepStateFunding,
		model.SweepStateFunded,
		model.SweepStateSweeping,
		model.SweepStateSwept,
	}
}

// sweepSave 更新归集记录，统一维护 updated_at
func sweepSave(s *model.Sweep, updates map[string]any) {
	if _, ok := updates["updated_at"]; !ok {
		updates["updated_at"] = time.Now()
	}
	if err := model.Db.Model(&model.Sweep{}).Where("id = ?", s.ID).Updates(updates).Error; err != nil {
		log.Task.Warn("HD 归集：记录更新失败：", err)
	}
}

// sweepDefer 记录错误并按指数退避推迟重试，超过次数上限置 failed
func sweepDefer(s *model.Sweep, reason error) {
	s.Attempts++
	msg := sweepTrimError(reason)
	if s.Attempts > sweepMaxAttempts {
		log.Task.Error(fmt.Sprintf("HD 归集：记录 %d 重试次数超过上限，置为 failed：%s", s.ID, msg))
		sweepSave(s, map[string]any{
			"state":      model.SweepStateFailed,
			"last_error": msg,
			"attempts":   s.Attempts,
			"updated_at": time.Now(),
		})
		s.State = model.SweepStateFailed

		return
	}

	backoff := time.Duration(math.Min(math.Pow(2, float64(s.Attempts)), 60)) * sweepBackoffUnit
	sweepSave(s, map[string]any{
		"attempts":      s.Attempts,
		"last_error":    msg,
		"next_retry_at": time.Now().Add(backoff),
		"updated_at":    time.Now(),
	})
	s.NextRetryAt = nil
	log.Task.Warn(fmt.Sprintf("HD 归集：记录 %d 第 %d 次失败，%s 后重试：%s", s.ID, s.Attempts, backoff, msg))
}

// sweepTrimError 裁剪错误信息，防止过长或携带敏感内容
func sweepTrimError(err error) string {
	msg := utils.SanitizeRpcError(err.Error())
	if len(msg) > 512 {
		msg = msg[:512]
	}

	return msg
}

func sweepTokenAddress() string {
	return strings.ToLower(conf.UsdtBep20)
}

func sweepStep(ctx context.Context, rpc *utils.EvmRpc, s *model.Sweep) {
	switch s.State {
	case model.SweepStatePending:
		sweepStepPending(ctx, rpc, s)
	case model.SweepStateFunding:
		sweepStepFunding(ctx, rpc, s)
	case model.SweepStateFunded:
		sweepStepFunded(ctx, rpc, s)
	case model.SweepStateSweeping:
		sweepStepSweeping(ctx, rpc, s)
	case model.SweepStateSwept:
		sweepStepSwept(ctx, rpc, s)
	}
}

// sweepStepPending 检查派生地址余额，必要时先补给 BNB
func sweepStepPending(ctx context.Context, rpc *utils.EvmRpc, s *model.Sweep) {
	from := strings.ToLower(s.Address)
	dest := s.DestAddress

	balance, err := rpc.CallBalanceOf(ctx, sweepTokenAddress(), from)
	if err != nil {
		sweepDefer(s, err)

		return
	}
	if balance.Sign() == 0 {
		log.Task.Info(fmt.Sprintf("HD 归集：派生地址 %s USDT 余额为 0，跳过记录 %d", from, s.ID))
		sweepSave(s, map[string]any{"state": model.SweepStateSkipped})
		s.State = model.SweepStateSkipped

		return
	}

	gasPrice, err := rpc.GasPrice(ctx)
	if err != nil {
		sweepDefer(s, err)

		return
	}
	bnb, err := rpc.GetBalance(ctx, from)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	gasLimit, err := sweepEstimateTransferGas(ctx, rpc, from, dest, balance)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	// 补给需求：gas 上取 1.3 余量，再乘 1.2 余量
	need := new(big.Int).Mul(new(big.Int).SetUint64(gasLimit), gasPrice)
	need.Mul(need, big.NewInt(6))
	need.Div(need, big.NewInt(5)) // ×1.2

	if bnb.Cmp(need) >= 0 {
		sweepSave(s, map[string]any{"state": model.SweepStateFunded})
		s.State = model.SweepStateFunded

		return
	}

	fundAmt := new(big.Int).Sub(need, bnb)
	if capWei := model.SweepGasCapWei(); capWei != nil && fundAmt.Cmp(capWei) > 0 {
		log.Task.Error(fmt.Sprintf(
			"HD 归集：记录 %d 所需补给 %s wei 超过 HD_SWEEP_GAS_BNB 上限 %s wei，置为 failed，请调大上限",
			s.ID, fundAmt.String(), capWei.String()))
		sweepSave(s, map[string]any{
			"state":      model.SweepStateFailed,
			"last_error": fmt.Sprintf("补给量 %s wei 超过 HD_SWEEP_GAS_BNB 上限 %s wei", fundAmt.String(), capWei.String()),
			"updated_at": time.Now(),
		})
		s.State = model.SweepStateFailed

		return
	}

	// 气费账户（index 0）余额需覆盖补给量 + 补给交易自身 gas
	gasAddress := model.SweepGasAddress()
	gasBalance, err := rpc.GetBalance(ctx, gasAddress)
	if err != nil {
		sweepDefer(s, err)

		return
	}
	fundCost := new(big.Int).Add(fundAmt, new(big.Int).Mul(gasPrice, new(big.Int).SetUint64(sweepFundGas)))
	if gasBalance.Cmp(fundCost) < 0 {
		log.Task.Error(fmt.Sprintf(
			"HD 归集：主地址 BNB 不足，请先向主地址 %s 打入一些 BNB 作手续费（本次约需 %s wei）",
			gasAddress, fundCost.String()))
		sweepSave(s, map[string]any{
			"last_error":    "主地址 BNB 不足，请先向气费地址补充 BNB",
			"next_retry_at": time.Now().Add(sweepGasDeferDelay),
			"updated_at":    time.Now(),
		})
		s.NextRetryAt = nil

		return
	}

	nonce, err := rpc.GetNonce(ctx, gasAddress)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	toBytes, _ := hexDecodeAddress(from)
	tx := utils.LegacyTx{
		Nonce:    nonce,
		GasPrice: gasPrice,
		Value:    fundAmt,
		Gas:      sweepFundGas,
		To:       toBytes,
		ChainID:  sweepBscChainID,
	}
	raw, hash, err := model.SignHdLegacyTx(0, tx)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	// 先落库再广播，崩溃恢复时仍可凭 fund_tx 查询回执
	sweepSave(s, map[string]any{
		"state":      model.SweepStateFunding,
		"fund_tx":    hash,
		"fund_value": fundAmt.String(),
		"updated_at": time.Now(),
	})
	s.State = model.SweepStateFunding
	s.FundTx = hash

	if err := rpc.SendRawTransaction(ctx, raw); err != nil {
		// 广播报错不代表交易没发出，保留 fund_tx 等回执；超时回退到 pending 时会重读余额，不会重复补给
		sweepDefer(s, err)

		return
	}

	log.Task.Info(fmt.Sprintf(
		"HD 归集：记录 %d 已向派生地址 %s 补给 BNB %s wei，交易 %s",
		s.ID, from, fundAmt.String(), hash))
}

// sweepStepFunding 等待补给交易确认
func sweepStepFunding(ctx context.Context, rpc *utils.EvmRpc, s *model.Sweep) {
	status, err := rpc.GetReceipt(ctx, s.FundTx)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	switch status {
	case utils.ReceiptSuccess:
		sweepSave(s, map[string]any{"state": model.SweepStateFunded})
		s.State = model.SweepStateFunded
	case utils.ReceiptFailed:
		failed := s.FundTx
		log.Task.Warn(fmt.Sprintf("HD 归集：记录 %d 补给交易 %s 上链失败，回退重试", s.ID, failed))
		sweepSave(s, map[string]any{
			"state":      model.SweepStatePending,
			"fund_tx":    "",
			"updated_at": time.Now(),
		})
		s.State = model.SweepStatePending
		s.FundTx = ""
		sweepDefer(s, fmt.Errorf("补给交易上链失败：%s", failed))
	default:
		if s.UpdatedAt != nil && time.Since(s.UpdatedAt.Time()) > sweepReceiptTimeout {
			log.Task.Warn(fmt.Sprintf("HD 归集：记录 %d 补给交易 %s 长时间未确认，回退重试", s.ID, s.FundTx))
			s.Attempts++
			sweepSave(s, map[string]any{
				"state":      model.SweepStatePending,
				"fund_tx":    "",
				"attempts":   s.Attempts,
				"updated_at": time.Now(),
			})
			s.State = model.SweepStatePending
			s.FundTx = ""
		}
		// 不足 10 分钟：等待下一轮
	}
}

// sweepStepFunded 把派生地址全部 USDT 余额转到归集目标
func sweepStepFunded(ctx context.Context, rpc *utils.EvmRpc, s *model.Sweep) {
	from := strings.ToLower(s.Address)
	dest := s.DestAddress

	balance, err := rpc.CallBalanceOf(ctx, sweepTokenAddress(), from)
	if err != nil {
		sweepDefer(s, err)

		return
	}
	if balance.Sign() == 0 {
		if s.SweepTx != "" {
			sweepSave(s, map[string]any{"state": model.SweepStateSwept})
			s.State = model.SweepStateSwept
		} else {
			sweepSave(s, map[string]any{"state": model.SweepStateSkipped})
			s.State = model.SweepStateSkipped
		}

		return
	}

	gasPrice, err := rpc.GasPrice(ctx)
	if err != nil {
		sweepDefer(s, err)

		return
	}
	bnb, err := rpc.GetBalance(ctx, from)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	gasLimit, err := sweepEstimateTransferGas(ctx, rpc, from, dest, balance)
	if err != nil {
		sweepDefer(s, err)

		return
	}
	if bnb.Cmp(new(big.Int).Mul(new(big.Int).SetUint64(gasLimit), gasPrice)) < 0 {
		// BNB 不足，回到 pending 重新补给（重新补给时会重新读余额，余额已够就不会重复补）
		sweepSave(s, map[string]any{
			"state":      model.SweepStatePending,
			"updated_at": time.Now(),
		})
		s.State = model.SweepStatePending
		s.Attempts++
		sweepSave(s, map[string]any{"attempts": s.Attempts, "updated_at": time.Now()})

		return
	}

	nonce, err := rpc.GetNonce(ctx, from)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	destBytes, _ := hexDecodeAddress(dest)
	tx := utils.LegacyTx{
		Nonce:    nonce,
		GasPrice: gasPrice,
		Value:    new(big.Int),
		Gas:      gasLimit,
		To:       hexDecodeAddressOr(sweepTokenAddress()),
		Data:     utils.Erc20TransferData(destBytes, balance),
		ChainID:  sweepBscChainID,
	}
	raw, hash, err := model.SignHdLegacyTx(uint32(s.DeriveIndex), tx)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	// 先落库再广播
	sweepSave(s, map[string]any{
		"state":      model.SweepStateSweeping,
		"sweep_tx":   hash,
		"amount":     balance.String(),
		"updated_at": time.Now(),
	})
	s.State = model.SweepStateSweeping
	s.SweepTx = hash
	s.Amount = balance.String()

	if err := rpc.SendRawTransaction(ctx, raw); err != nil {
		// 同上：保留 sweep_tx，超时后回到 funded 重读余额，已转走则余额为 0，不会重复转账
		sweepDefer(s, err)

		return
	}

	log.Task.Info(fmt.Sprintf(
		"HD 归集：记录 %d 已广播 USDT 转账，地址 %s → %s，金额 %s wei，交易 %s",
		s.ID, from, dest, balance.String(), hash))
}

// sweepStepSweeping 等待 USDT 转账确认
func sweepStepSweeping(ctx context.Context, rpc *utils.EvmRpc, s *model.Sweep) {
	status, err := rpc.GetReceipt(ctx, s.SweepTx)
	if err != nil {
		sweepDefer(s, err)

		return
	}

	switch status {
	case utils.ReceiptSuccess:
		log.Task.Info(fmt.Sprintf("HD 归集：记录 %d USDT 转账 %s 已确认", s.ID, s.SweepTx))
		sweepSave(s, map[string]any{"state": model.SweepStateSwept, "return_tries": 0})
		s.State = model.SweepStateSwept
		s.ReturnTries = 0
	case utils.ReceiptFailed:
		failed := s.SweepTx
		log.Task.Warn(fmt.Sprintf("HD 归集：记录 %d USDT 转账 %s 上链失败，回退重试", s.ID, failed))
		sweepSave(s, map[string]any{
			"state":      model.SweepStateFunded,
			"sweep_tx":   "",
			"updated_at": time.Now(),
		})
		s.State = model.SweepStateFunded
		s.SweepTx = ""
		sweepDefer(s, fmt.Errorf("USDT 转账上链失败：%s", failed))
	default:
		if s.UpdatedAt != nil && time.Since(s.UpdatedAt.Time()) > sweepReceiptTimeout {
			// 重读余额：若旧交易其实已上链，余额为 0 会直接走 swept，不会重复转账
			log.Task.Warn(fmt.Sprintf("HD 归集：记录 %d USDT 转账 %s 长时间未确认，回退重读余额", s.ID, s.SweepTx))
			sweepSave(s, map[string]any{
				"state":      model.SweepStateFunded,
				"updated_at": time.Now(),
			})
			s.State = model.SweepStateFunded
		}
	}
}

// sweepStepSwept 回收派生地址剩余 BNB，失败不影响归集结果
func sweepStepSwept(ctx context.Context, rpc *utils.EvmRpc, s *model.Sweep) {
	from := strings.ToLower(s.Address)
	dest := s.DestAddress

	if s.ReturnTx != "" {
		// 回收交易已广播，直接结束，不阻塞归集结果
		sweepSave(s, map[string]any{"state": model.SweepStateDone})
		s.State = model.SweepStateDone

		return
	}

	balance, err := rpc.GetBalance(ctx, from)
	if err != nil {
		sweepReturnFail(s, err)

		return
	}
	gasPrice, err := rpc.GasPrice(ctx)
	if err != nil {
		sweepReturnFail(s, err)

		return
	}

	baseCost := new(big.Int).Mul(gasPrice, new(big.Int).SetUint64(sweepFundGas))
	cost := new(big.Int).Mul(baseCost, big.NewInt(11))
	cost.Div(cost, big.NewInt(10)) // ×1.1 余量
	remain := new(big.Int).Sub(balance, cost)

	// 剩余不足一笔转账 gas 的一半，不值得回收
	if remain.Sign() <= 0 || remain.Cmp(new(big.Int).Div(baseCost, big.NewInt(2))) < 0 {
		sweepSave(s, map[string]any{"state": model.SweepStateDone})
		s.State = model.SweepStateDone

		return
	}

	nonce, err := rpc.GetNonce(ctx, from)
	if err != nil {
		sweepReturnFail(s, err)

		return
	}

	destBytes, _ := hexDecodeAddress(dest)
	tx := utils.LegacyTx{
		Nonce:    nonce,
		GasPrice: gasPrice,
		Value:    remain,
		Gas:      sweepFundGas,
		To:       destBytes,
		ChainID:  sweepBscChainID,
	}
	raw, hash, err := model.SignHdLegacyTx(uint32(s.DeriveIndex), tx)
	if err != nil {
		sweepReturnFail(s, err)

		return
	}

	sweepSave(s, map[string]any{
		"return_tx":  hash,
		"updated_at": time.Now(),
	})
	s.ReturnTx = hash

	if err := rpc.SendRawTransaction(ctx, raw); err != nil {
		sweepSave(s, map[string]any{"return_tx": "", "updated_at": time.Now()})
		s.ReturnTx = ""
		sweepReturnFail(s, err)

		return
	}

	log.Task.Info(fmt.Sprintf("HD 归集：记录 %d 已回收剩余 BNB %s wei 至 %s，交易 %s",
		s.ID, remain.String(), dest, hash))
	sweepSave(s, map[string]any{"state": model.SweepStateDone})
	s.State = model.SweepStateDone
}

// sweepReturnFail 回收失败最多重试 3 次，之后直接 done
func sweepReturnFail(s *model.Sweep, err error) {
	if s.ReturnTries+1 >= sweepMaxReturnTries {
		log.Task.Warn(fmt.Sprintf("HD 归集：记录 %d 回收 BNB 多次失败，直接完成：%s", s.ID, sweepTrimError(err)))
		sweepSave(s, map[string]any{
			"state":        model.SweepStateDone,
			"return_tries": s.ReturnTries + 1,
			"last_error":   "BNB 回收失败：" + sweepTrimError(err),
			"updated_at":   time.Now(),
		})
		s.State = model.SweepStateDone

		return
	}

	s.ReturnTries++
	sweepSave(s, map[string]any{
		"return_tries":  s.ReturnTries,
		"last_error":    "BNB 回收失败：" + sweepTrimError(err),
		"next_retry_at": time.Now().Add(time.Duration(s.ReturnTries) * sweepBackoffUnit),
		"updated_at":    time.Now(),
	})
	s.NextRetryAt = nil
	log.Task.Warn(fmt.Sprintf("HD 归集：记录 %d 回收 BNB 第 %d 次失败：%s", s.ID, s.ReturnTries, sweepTrimError(err)))
}

// sweepEstimateTransferGas 估算 ERC20 transfer gas，失败用 100000 兜底，再上取 1.3 余量
func sweepEstimateTransferGas(ctx context.Context, rpc *utils.EvmRpc, from, dest string, amount *big.Int) (uint64, error) {
	destBytes, err := hexDecodeAddressErr(dest)
	if err != nil {
		return 0, err
	}

	data := utils.Erc20TransferData(destBytes, amount)
	gas, err := rpc.EstimateGas(ctx, from, sweepTokenAddress(), data, new(big.Int))
	if err != nil || gas == 0 {
		gas = 100000
	}
	gas = uint64(math.Ceil(float64(gas) * 1.3))

	return gas, nil
}

func hexDecodeAddress(addr string) ([]byte, error) {
	return hexDecodeAddressErr(addr)
}

func hexDecodeAddressErr(addr string) ([]byte, error) {
	b, err := hexDecodeString(strings.TrimPrefix(strings.ToLower(addr), "0x"))
	if err != nil {
		return nil, err
	}
	if len(b) != 20 {
		return nil, fmt.Errorf("地址长度不合法：%s", addr)
	}

	return b, nil
}

func hexDecodeAddressOr(addr string) []byte {
	b, _ := hexDecodeAddressErr(addr)

	return b
}

func hexDecodeString(s string) ([]byte, error) {
	var out []byte
	if len(s)%2 != 0 {
		s = "0" + s
	}
	for i := 0; i < len(s); i += 2 {
		hi, ok1 := hexNibble(s[i])
		lo, ok2 := hexNibble(s[i+1])
		if !ok1 || !ok2 {
			return nil, fmt.Errorf("十六进制解析失败")
		}
		out = append(out, hi<<4|lo)
	}

	return out, nil
}

func hexNibble(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	default:
		return 0, false
	}
}
