package model

import (
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/tyler-smith/go-bip39"
	applog "github.com/v03413/bepusdt/app/log"
	"github.com/v03413/bepusdt/app/utils"
	"golang.org/x/crypto/sha3"
)

// HD 测试的公共环境：临时日志目录、临时 SQLite，助记词全部运行时生成

func initHdTestEnv(t *testing.T) {
	t.Helper()

	if err := applog.Init(filepath.Join(t.TempDir(), "logs")); err != nil {
		t.Fatalf("init log: %v", err)
	}
	t.Cleanup(applog.Close)

	if err := Init(filepath.Join(t.TempDir(), "hd-test.db"), ""); err != nil {
		t.Fatalf("init db: %v", err)
	}
	t.Cleanup(func() {
		if db, err := Db.DB(); err == nil {
			_ = db.Close()
		}
	})

	Db.Create(&Rate{Rate: "7", Fiat: string(CNY), Crypto: string(USDT), RawRate: 7})
}

func newTestMnemonic(t *testing.T) string {
	t.Helper()

	entropy, err := bip39.NewEntropy(128)
	if err != nil {
		t.Fatalf("new entropy: %v", err)
	}
	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		t.Fatalf("new mnemonic: %v", err)
	}

	return mnemonic
}

// setHdEnv 设置环境变量并初始化，结束后还原 HD 全局状态
func setHdEnv(t *testing.T, mnemonic, types string) error {
	t.Helper()

	old := hdCurrent
	t.Cleanup(func() { hdCurrent = old })
	t.Setenv("HD_MNEMONIC", mnemonic)
	t.Setenv("HD_TRADE_TYPES", types)

	return InitHD()
}

func enableHd(t *testing.T, types string) {
	t.Helper()

	if err := setHdEnv(t, newTestMnemonic(t), types); err != nil {
		t.Fatalf("init hd: %v", err)
	}
}

// isEip55 独立实现的 EIP-55 校验
func isEip55(address string) bool {
	if !strings.HasPrefix(address, "0x") || len(address) != 42 {
		return false
	}

	lower := strings.ToLower(address[2:])
	h := sha3.NewLegacyKeccak256()
	h.Write([]byte(lower))
	hash := hex.EncodeToString(h.Sum(nil))
	for i, c := range address[2:] {
		upper := hash[i] >= '8'
		if c >= 'a' && c <= 'f' && upper {
			return false
		}
		if c >= 'A' && c <= 'F' && !upper {
			return false
		}
	}

	return true
}

func countDerived(t *testing.T) int64 {
	t.Helper()

	var count int64
	Db.Model(&DerivedAddress{}).Count(&count)

	return count
}

func TestEip55Checker(t *testing.T) {
	// EIP-55 规范中的公开示例地址
	for _, addr := range []string{
		"0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
		"0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
		"0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
		"0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
	} {
		if !isEip55(addr) {
			t.Fatalf("%s should pass eip55", addr)
		}
	}
	if isEip55("0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed") {
		t.Fatal("broken checksum should fail")
	}
}

func TestHdDeriveWithEnvVector(t *testing.T) {
	mnemonic := os.Getenv("HD_TEST_MNEMONIC")
	want := os.Getenv("HD_TEST_ADDR0")
	if mnemonic == "" || want == "" {
		t.Skip("HD_TEST_MNEMONIC / HD_TEST_ADDR0 未设置")
	}

	h, err := utils.NewHD(mnemonic)
	if err != nil {
		t.Fatalf("new hd: %v", err)
	}
	address, lower, err := h.DeriveAddress(0)
	if err != nil {
		t.Fatalf("derive: %v", err)
	}
	if lower != strings.ToLower(want) {
		t.Fatalf("index 0 address mismatch: got %s", address)
	}
	if want != strings.ToLower(want) && address != want {
		t.Fatalf("checksum mismatch: got %s", address)
	}
}

func TestHdDeriveDeterministic(t *testing.T) {
	mnemonic := newTestMnemonic(t)
	h1, err := utils.NewHD(mnemonic)
	if err != nil {
		t.Fatalf("new hd: %v", err)
	}
	h2, err := utils.NewHD("  " + strings.ReplaceAll(mnemonic, " ", "\n  ") + " ")
	if err != nil {
		t.Fatalf("new hd with spaces: %v", err)
	}
	if h1.KeyFingerprint() != h2.KeyFingerprint() || len(h1.KeyFingerprint()) != 16 {
		t.Fatalf("fingerprint mismatch: %s %s", h1.KeyFingerprint(), h2.KeyFingerprint())
	}

	seen := make(map[string]bool)
	for _, n := range []uint32{0, 1, 2, 1000} {
		a1, l1, err := h1.DeriveAddress(n)
		if err != nil {
			t.Fatalf("derive %d: %v", n, err)
		}
		a2, l2, _ := h2.DeriveAddress(n)
		if a1 != a2 || l1 != l2 {
			t.Fatalf("index %d not deterministic", n)
		}
		if strings.ToLower(a1) != l1 || !utils.IsValidEvmAddress(a1) {
			t.Fatalf("index %d address/match_addr mismatch: %s %s", n, a1, l1)
		}
		if !isEip55(a1) {
			t.Fatalf("index %d not eip55: %s", n, a1)
		}
		if seen[l1] {
			t.Fatalf("index %d duplicated address", n)
		}
		seen[l1] = true
	}

	other, _ := utils.NewHD(newTestMnemonic(t))
	if other.KeyFingerprint() == h1.KeyFingerprint() {
		t.Fatal("different mnemonic should have different fingerprint")
	}
	if _, _, err := h1.DeriveAddress(1 << 31); err == nil {
		t.Fatal("hardened index should fail")
	}
}

func TestInitHdValidate(t *testing.T) {
	mnemonic := newTestMnemonic(t)
	words := strings.Fields(mnemonic)
	invalid := strings.Join(append(words[:len(words)-1], "notaword"), " ")

	cases := []struct {
		name     string
		mnemonic string
		types    string
	}{
		{"invalid mnemonic", invalid, "usdt.bep20"},
		{"invalid mnemonic without types", invalid, ""},
		{"tron type", mnemonic, "usdt.bep20,usdt.trc20"},
		{"unknown type", mnemonic, "usdt.nosuch"},
		{"types without mnemonic", "", "usdt.bep20"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := setHdEnv(t, c.mnemonic, c.types)
			if err == nil {
				t.Fatal("expected error")
			}
			for _, w := range strings.Fields(c.mnemonic) {
				if strings.Contains(err.Error(), w) {
					t.Fatalf("error leaks mnemonic word: %v", err)
				}
			}
			if IsHdTradeType(UsdtBep20) {
				t.Fatal("hd should not be enabled after error")
			}
		})
	}

	t.Run("both empty", func(t *testing.T) {
		if err := setHdEnv(t, "", ""); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if IsHdTradeType(UsdtBep20) || len(GetHdTradeTypes()) != 0 {
			t.Fatal("hd should be disabled")
		}
	})

	t.Run("mnemonic without types", func(t *testing.T) {
		if err := setHdEnv(t, mnemonic, ""); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if IsHdTradeType(UsdtBep20) {
			t.Fatal("no type should be enabled")
		}
		if _, ok := os.LookupEnv("HD_MNEMONIC"); ok {
			t.Fatal("HD_MNEMONIC should be unset")
		}
	})

	t.Run("evm", func(t *testing.T) {
		if err := setHdEnv(t, mnemonic, "evm"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		for _, tt := range []TradeType{UsdtBep20, BscBnb, EthereumEth, UsdcBase, UsdtPlasma, UsdtXlayer} {
			if !IsHdTradeType(tt) {
				t.Fatalf("%s should be enabled", tt)
			}
		}
		for _, tt := range []TradeType{UsdtTrc20, TronTrx, UsdtSolana, UsdtAptos, UsdtTon, TonGram} {
			if IsHdTradeType(tt) || IsEvmTradeType(tt) {
				t.Fatalf("%s should not be evm", tt)
			}
		}
	})
}

func TestHdAllocateConcurrent(t *testing.T) {
	initHdTestEnv(t)
	enableHd(t, "usdt.bep20")

	const n = 50
	var wg sync.WaitGroup
	wallets := make([]Wallet, n)
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			wallets[i], errs[i] = allocateDerivedWallet(UsdtBep20, fmt.Sprintf("order-%d", i))
		}(i)
	}
	wg.Wait()

	seen := make(map[string]bool)
	for i, w := range wallets {
		if errs[i] != nil {
			t.Fatalf("allocate %d: %v", i, errs[i])
		}
		if !w.Derived || seen[w.MatchAddr] {
			t.Fatalf("wallet %d invalid or duplicated: %+v", i, w)
		}
		seen[w.MatchAddr] = true
	}

	var rows []DerivedAddress
	Db.Find(&rows)
	if len(rows) != n {
		t.Fatalf("rows = %d, want %d", len(rows), n)
	}
	indexes := make(map[int64]bool)
	for _, r := range rows {
		if strings.HasPrefix(r.MatchAddr, "pending:") || strings.HasPrefix(r.KeyFingerprint, "pending:") {
			t.Fatalf("placeholder left: %+v", r)
		}
		if indexes[r.DeriveIndex] || r.DeriveIndex != r.ID {
			t.Fatalf("derive_index invalid: %+v", r)
		}
		indexes[r.DeriveIndex] = true
		if r.Address == "" || strings.ToLower(r.Address) != r.MatchAddr || r.KeyFingerprint != hdCurrent.derivator.KeyFingerprint() {
			t.Fatalf("row invalid: %+v", r)
		}
	}
}

func TestHdBuildTrade(t *testing.T) {
	initHdTestEnv(t)
	enableHd(t, "usdt.bep20")

	p := OrderParams{Money: decimal.NewFromInt(10), TradeType: UsdtBep20, Fiat: CNY, OrderId: "a"}
	t1, err := BuildTrade(p)
	if err != nil {
		t.Fatalf("build trade: %v", err)
	}
	if !t1.Wallet.Derived || t1.Amount != "1.43" {
		t.Fatalf("unexpected trade: %+v", t1)
	}

	o1, err := BuildOrder(p, t1)
	if err != nil {
		t.Fatalf("build order: %v", err)
	}
	if o1.Address != t1.Wallet.Address || !isEip55(o1.Address) || o1.MatchAddress != strings.ToLower(o1.Address) || o1.AddressLocked {
		t.Fatalf("unexpected order: %+v", o1)
	}

	p.OrderId = "b"
	t2, err := BuildTrade(p)
	if err != nil {
		t.Fatalf("build trade 2: %v", err)
	}
	if t2.Amount != t1.Amount || t2.Wallet.MatchAddr == t1.Wallet.MatchAddr {
		t.Fatalf("second trade should keep amount and use new address: %+v", t2)
	}

	// 独占模式，连续两单都不应报「暂无可用钱包地址」
	for _, id := range []string{"c", "d"} {
		locked := OrderParams{Money: decimal.Zero, TradeType: UsdtBep20, Fiat: CNY, OrderId: id, AddressLocked: true}
		tl, err := BuildTrade(locked)
		if err != nil {
			t.Fatalf("locked trade: %v", err)
		}
		if tl.Amount != "0" {
			t.Fatalf("locked amount = %s", tl.Amount)
		}
		o, err := BuildOrder(locked, tl)
		if err != nil || !o.AddressLocked {
			t.Fatalf("locked order: %v %+v", err, o)
		}
	}

	// 未启用的类型仍走地址池
	_, err = BuildTrade(OrderParams{Money: decimal.NewFromInt(10), TradeType: UsdtTrc20, Fiat: CNY, OrderId: "e"})
	if err == nil || !strings.Contains(err.Error(), "未检测到可用钱包地址") {
		t.Fatalf("trc20 should use wallet pool: %v", err)
	}
	if countDerived(t) != 4 {
		t.Fatalf("derived rows = %d, want 4", countDerived(t))
	}
}

func TestHdRebuildOrderReuse(t *testing.T) {
	initHdTestEnv(t)
	enableHd(t, "usdt.bep20,usdt.erc20")

	pending, err := BuildPendingOrder(OrderParams{Money: decimal.NewFromInt(10), Fiat: CNY, OrderId: "r", ApiType: OrderApiTypeEpusdtOrder})
	if err != nil {
		t.Fatalf("pending order: %v", err)
	}
	if pending.TradeType != "" || pending.MatchAddress != "" {
		t.Fatalf("unexpected pending order: %+v", pending)
	}

	p := OrderParams{Money: decimal.NewFromInt(10), Fiat: CNY, OrderId: "r", TradeType: UsdtBep20, Timeout: 600}
	o1, err := RebuildOrder(pending, p)
	if err != nil {
		t.Fatalf("rebuild bep20: %v", err)
	}
	if countDerived(t) != 1 || o1.Address == "" || !isEip55(o1.Address) {
		t.Fatalf("first select should derive one address: %d %+v", countDerived(t), o1)
	}

	p.TradeType = UsdtErc20
	o2, err := RebuildOrder(o1, p)
	if err != nil {
		t.Fatalf("rebuild erc20: %v", err)
	}
	if o2.MatchAddress != o1.MatchAddress || o2.Address != o1.Address || o2.TradeType != UsdtErc20 || countDerived(t) != 1 {
		t.Fatalf("reselect should reuse address: %d %+v", countDerived(t), o2)
	}

	var saved Order
	Db.First(&saved, o2.ID)
	if saved.MatchAddress != o1.MatchAddress || saved.TradeType != UsdtErc20 {
		t.Fatalf("saved order mismatch: %+v", saved)
	}
}

func TestHdGetMethods(t *testing.T) {
	initHdTestEnv(t)

	o := Order{Status: OrderStatusWaiting, Money: "10", Fiat: CNY, ApiType: OrderApiTypeEpusdtOrder}
	if items := o.GetMethods(""); len(items) != 0 {
		t.Fatalf("no wallet and no hd should return empty: %+v", items)
	}

	enableHd(t, "usdt.bep20")
	items := o.GetMethods("")
	if len(items) != 1 || items[0].Network != "bsc" || items[0].Currency != string(USDT) || items[0].ActualAmount != "1.43" {
		t.Fatalf("unexpected methods: %+v", items)
	}
}
