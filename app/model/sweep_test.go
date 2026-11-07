package model

import (
	"encoding/hex"
	"math/big"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/v03413/bepusdt/app/utils"
)

func osSetenv(key, value string) error {
	return os.Setenv(key, value)
}

func bigNewInt(n int64) *big.Int { return big.NewInt(n) }

func hexDecode20(addr string) []byte {
	b, _ := hex.DecodeString(strings.TrimPrefix(strings.ToLower(addr), "0x"))

	return b
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

// sweep 测试的公共环境还原：归集配置与 HD 状态用 InitSweep/InitHD 重置

func resetSweepEnv(t *testing.T) {
	t.Helper()

	t.Cleanup(func() {
		_ = resetEnvFor("HD_SWEEP_ENABLED", "HD_COLLECT_ADDRESS", "HD_SWEEP_GAS_BNB")
	})
}

func resetEnvFor(keys ...string) error {
	for _, k := range keys {
		_ = osSetenv(k, "")
	}

	return InitSweep()
}

func setSweepEnv(t *testing.T, enabled, collect, gasCap string) error {
	t.Helper()

	resetSweepEnv(t)
	t.Setenv("HD_SWEEP_ENABLED", enabled)
	t.Setenv("HD_COLLECT_ADDRESS", collect)
	t.Setenv("HD_SWEEP_GAS_BNB", gasCap)

	return InitSweep()
}

func enableSweep(t *testing.T) {
	t.Helper()

	if err := setSweepEnv(t, "", "", ""); err != nil {
		t.Fatalf("init sweep: %v", err)
	}
}

func countSweep(t *testing.T) int64 {
	t.Helper()

	var count int64
	Db.Model(&Sweep{}).Count(&count)

	return count
}

func TestSweepInitConfig(t *testing.T) {
	initHdTestEnv(t)
	mnemonic := newTestMnemonic(t)

	t.Run("explicit true without hd", func(t *testing.T) {
		if err := setHdEnv(t, "", ""); err != nil {
			t.Fatalf("init hd: %v", err)
		}
		err := setSweepEnv(t, "true", "", "")
		if err == nil {
			t.Fatal("expected error")
		}
		if !strings.Contains(err.Error(), "HD_SWEEP_ENABLED") {
			t.Fatalf("unexpected error: %v", err)
		}
		if IsSweepEnabled() {
			t.Fatal("sweep should be disabled after error")
		}
	})

	t.Run("invalid collect address", func(t *testing.T) {
		if err := setHdEnv(t, mnemonic, "usdt.bep20"); err != nil {
			t.Fatalf("init hd: %v", err)
		}
		err := setSweepEnv(t, "true", "0x123", "")
		if err == nil {
			t.Fatal("expected error")
		}
		if !strings.Contains(err.Error(), "HD_COLLECT_ADDRESS") {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("invalid enabled value", func(t *testing.T) {
		err := setSweepEnv(t, "yes", "", "")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("invalid gas cap", func(t *testing.T) {
		err := setSweepEnv(t, "true", "", "abc")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("default enabled with bep20 hd", func(t *testing.T) {
		if err := setHdEnv(t, mnemonic, "usdt.bep20"); err != nil {
			t.Fatalf("init hd: %v", err)
		}
		if err := setSweepEnv(t, "", "", ""); err != nil {
			t.Fatalf("init sweep: %v", err)
		}
		if !IsSweepEnabled() {
			t.Fatal("sweep should be enabled by default")
		}

		// 默认归集目标是 index 0 地址，也是气费账户
		_, lower, err := HdAddressAt(0)
		if err != nil {
			t.Fatalf("address at 0: %v", err)
		}
		if SweepDestAddress() != lower || SweepGasAddress() != lower {
			t.Fatalf("dest/gas mismatch: %s %s %s", SweepDestAddress(), SweepGasAddress(), lower)
		}
		if SweepGasCapWei() != nil {
			t.Fatal("gas cap should be unset")
		}
	})

	t.Run("explicit false disables", func(t *testing.T) {
		if err := setSweepEnv(t, "false", "", ""); err != nil {
			t.Fatalf("init sweep: %v", err)
		}
		if IsSweepEnabled() {
			t.Fatal("sweep should be disabled")
		}
	})

	t.Run("custom collect address and cap", func(t *testing.T) {
		if err := setHdEnv(t, mnemonic, "usdt.bep20"); err != nil {
			t.Fatalf("init hd: %v", err)
		}
		// 一个运行时随机派生的合法地址，不硬编码
		otherHd, err := utils.NewHD(newTestMnemonic(t))
		if err != nil {
			t.Fatalf("new hd: %v", err)
		}
		_, lower, err := otherHd.DeriveAddress(3)
		if err := setSweepEnv(t, "true", lower, "0.0005"); err != nil {
			t.Fatalf("init sweep: %v", err)
		}
		if SweepDestAddress() != strings.ToLower(lower) {
			t.Fatalf("dest mismatch: %s", SweepDestAddress())
		}
		if SweepGasCapWei() == nil || SweepGasCapWei().String() != "500000000000000" {
			t.Fatalf("gas cap mismatch: %s", SweepGasCapWei())
		}
	})

	t.Run("hd without bep20 type defaults disabled", func(t *testing.T) {
		if err := setHdEnv(t, mnemonic, "usdt.erc20"); err != nil {
			t.Fatalf("init hd: %v", err)
		}
		if err := setSweepEnv(t, "", "", ""); err != nil {
			t.Fatalf("init sweep: %v", err)
		}
		if IsSweepEnabled() {
			t.Fatal("sweep should be disabled without usdt.bep20")
		}
	})
}

func TestSweepSignUsesHdIndex(t *testing.T) {
	// 每个索引签名恢复出的地址等于派生地址；index 0 即默认归集目标
	enableHd(t, "usdt.bep20")

	_, lower0, err := HdAddressAt(0)
	if err != nil {
		t.Fatalf("address 0: %v", err)
	}

	for index := uint32(0); index < 3; index++ {
		_, lower, err := HdAddressAt(index)
		if err != nil {
			t.Fatalf("address %d: %v", index, err)
		}

		tx := utils.LegacyTx{
			Nonce:    uint64(index),
			GasPrice: bigNewInt(1000000000),
			Value:    bigNewInt(1),
			Gas:      21000,
			To:       hexDecode20(strings.ToLower(lower0)),
			ChainID:  56,
		}
		raw, _, err := SignHdLegacyTx(index, tx)
		if err != nil {
			t.Fatalf("sign %d: %v", index, err)
		}
		sender, err := utils.RecoverLegacyTxSender(raw)
		if err != nil {
			t.Fatalf("recover %d: %v", index, err)
		}
		if sender != lower {
			t.Fatalf("index %d sender %s != %s", index, sender, lower)
		}
	}
}

func TestEnqueueSweep(t *testing.T) {
	initHdTestEnv(t)
	enableHd(t, "usdt.bep20")
	enableSweep(t)

	mnemonicAddr := hdCurrent.derivator
	_ = mnemonicAddr

	// 创建派生地址记录：直接复用内部分配逻辑
	derived, err := allocateDerivedWallet(UsdtBep20, "order-sweep-1")
	if err != nil {
		t.Fatalf("allocate: %v", err)
	}

	o := Order{
		OrderId:      "order-sweep-1",
		TradeId:      "trade-sweep-1",
		TradeType:    UsdtBep20,
		Status:       OrderStatusSuccess,
		Amount:       "10",
		Address:      derived.Address,
		MatchAddress: derived.MatchAddr,
	}
	now := time.Now()
	o.ConfirmedAt = &now
	o.ExpiredAt = now.Add(time.Hour)
	at := Datetime(now)
	o.UpdatedAt = &at
	if err := Db.Create(&o).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	if err := EnqueueSweep(o); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if countSweep(t) != 1 {
		t.Fatalf("sweep rows = %d", countSweep(t))
	}

	var row Sweep
	if err := Db.Where("trade_id = ?", "trade-sweep-1").First(&row).Error; err != nil {
		t.Fatalf("load sweep: %v", err)
	}
	if row.State != SweepStatePending || row.DeriveIndex <= 0 {
		t.Fatalf("unexpected row: %+v", row)
	}
	if row.DestAddress != SweepDestAddress() {
		t.Fatalf("dest mismatch: %+v", row)
	}
	if row.Address != derived.Address {
		t.Fatalf("address mismatch: %+v", row)
	}
	if row.NextRetryAt == nil || row.NextRetryAt.Time().After(time.Now().Add(time.Minute)) {
		t.Fatalf("next retry at: %+v", row.NextRetryAt)
	}

	// 重复入队幂等
	if err := EnqueueSweep(o); err != nil {
		t.Fatalf("enqueue again: %v", err)
	}
	if countSweep(t) != 1 {
		t.Fatalf("sweep rows after repeat = %d", countSweep(t))
	}

	// 非 usdt.bep20 订单不入队
	other := Order{OrderId: "o2", TradeId: "t2", TradeType: UsdtTrc20, MatchAddress: derived.MatchAddr}
	if err := EnqueueSweep(other); err != nil {
		t.Fatalf("enqueue trc20: %v", err)
	}
	if countSweep(t) != 1 {
		t.Fatalf("trc20 should not enqueue")
	}

	// 匹配地址不在派生表里不入队
	unknown := Order{OrderId: "o3", TradeId: "t3", TradeType: UsdtBep20, MatchAddress: "0x1111111111111111111111111111111111111111"}
	if err := EnqueueSweep(unknown); err != nil {
		t.Fatalf("enqueue unknown: %v", err)
	}
	if countSweep(t) != 1 {
		t.Fatalf("unknown match addr should not enqueue")
	}

	// 归集未启用不入队
	if err := setSweepEnv(t, "false", "", ""); err != nil {
		t.Fatalf("disable sweep: %v", err)
	}
	if err := EnqueueSweep(o); err != nil {
		t.Fatalf("enqueue disabled: %v", err)
	}
	if countSweep(t) != 1 {
		t.Fatalf("disabled sweep should not enqueue")
	}
}

func TestEnqueueSweepByDerivedManual(t *testing.T) {
	initHdTestEnv(t)
	enableHd(t, "usdt.bep20")
	enableSweep(t)

	derived, err := allocateDerivedWallet(UsdtBep20, "order-manual-1")
	if err != nil {
		t.Fatalf("allocate: %v", err)
	}
	var record DerivedAddress
	if err := Db.Where("match_addr = ?", derived.MatchAddr).First(&record).Error; err != nil {
		t.Fatalf("load record: %v", err)
	}

	if err := EnqueueSweepByDerived(record, "order-manual-1", ""); err != nil {
		t.Fatalf("manual enqueue: %v", err)
	}
	var row Sweep
	if err := Db.Where("trade_id = ?", "manual:"+itoa(record.ID)).First(&row).Error; err != nil {
		t.Fatalf("load manual sweep: %v", err)
	}
	if row.OrderId != "order-manual-1" || row.State != SweepStatePending {
		t.Fatalf("unexpected manual row: %+v", row)
	}

	// 重复调用幂等
	if err := EnqueueSweepByDerived(record, "order-manual-1", ""); err != nil {
		t.Fatalf("manual enqueue again: %v", err)
	}
	if countSweep(t) != 1 {
		t.Fatalf("manual rows = %d", countSweep(t))
	}

	// 指纹不匹配的记录不能入队
	fake := record
	fake.KeyFingerprint = "0000000000000000"
	if err := EnqueueSweepByDerived(fake, "", ""); err == nil {
		t.Fatal("fingerprint mismatch should fail")
	}
}

func TestRetrySweep(t *testing.T) {
	initHdTestEnv(t)

	now := Datetime(time.Now())
	row := Sweep{TradeId: "trade-retry-1", State: SweepStateFailed, NextRetryAt: &now, LastError: "boom"}
	if err := Db.Create(&row).Error; err != nil {
		t.Fatalf("create: %v", err)
	}

	// 非 failed 状态不可重试
	row2 := Sweep{TradeId: "trade-retry-2", State: SweepStatePending, NextRetryAt: &now}
	if err := Db.Create(&row2).Error; err != nil {
		t.Fatalf("create 2: %v", err)
	}
	if err := RetrySweep(row2.ID); err == nil || !strings.Contains(err.Error(), "仅失败的记录可重试") {
		t.Fatalf("pending retry should fail: %v", err)
	}

	if err := RetrySweep(row.ID); err != nil {
		t.Fatalf("retry failed row: %v", err)
	}
	var updated Sweep
	if err := Db.Where("id = ?", row.ID).First(&updated).Error; err != nil {
		t.Fatalf("load: %v", err)
	}
	if updated.State != SweepStatePending || updated.Attempts != 0 || updated.LastError != "" {
		t.Fatalf("unexpected updated: %+v", updated)
	}
}
