package model

import (
	"path/filepath"
	"testing"

	"github.com/shopspring/decimal"
	applog "github.com/v03413/bepusdt/app/log"
)

func initRateTestDB(t *testing.T) {
	t.Helper()

	if err := applog.Init(filepath.Join(t.TempDir(), "logs")); err != nil {
		t.Fatalf("init log: %v", err)
	}
	t.Cleanup(applog.Close)

	if err := Init(filepath.Join(t.TempDir(), "rate-test.db"), ""); err != nil {
		t.Fatalf("init db: %v", err)
	}
	t.Cleanup(func() {
		if db, err := Db.DB(); err == nil {
			_ = db.Close()
		}
	})
}

func TestGetOrderRateUsesInternalConfigImmediately(t *testing.T) {
	initRateTestDB(t)

	// 模拟上一轮同步写入的基准价（无配置时 Rate 即为同步值）
	if err := Db.Create(&Rate{Rate: "6.56", Fiat: string(CNY), Crypto: string(USDT), RawRate: 6.56}).Error; err != nil {
		t.Fatalf("seed rate: %v", err)
	}

	cases := []struct{ syntax, want string }{
		{"", "6.56"},
		{"7.2", "7.2"},
		{"~1.02", "6.6912"},
		{"+0.1", "6.66"},
		{"-0.1", "6.46"},
		{"10", "10"},
		{"", "6.56"},
	}
	for _, c := range cases {
		SetK(ConfKey("rate_float_USDT_CNY"), c.syntax)

		got, err := GetOrderRate(USDT, CNY)
		if err != nil || !got.Equal(decimal.RequireFromString(c.want)) {
			t.Fatalf("syntax %q: got %v err %v, want %s", c.syntax, got, err, c.want)
		}
	}

	SetK(ConfKey("rate_float_USDT_CNY"), "7.2")
	got, _ := GetOrderRate(USDT, CNY)
	if amt := decimal.NewFromInt(25).DivRound(got, 2); amt.String() != "3.47" {
		t.Fatalf("amount = %s, want 3.47", amt)
	}
}

// 请求里传入的 rate 必须被忽略：建单只认内部配置
func TestBuildTradeIgnoresRequestRate(t *testing.T) {
	initRateTestDB(t)

	if err := Db.Create(&Rate{Rate: "6.56", Fiat: string(CNY), Crypto: string(USDT), RawRate: 6.56}).Error; err != nil {
		t.Fatalf("seed rate: %v", err)
	}
	if err := Db.Create(&Wallet{Address: "TTestAddr0000000000000000000000001", MatchAddr: "TTestAddr0000000000000000000000001", TradeType: string(UsdtTrc20), Status: 1}).Error; err != nil {
		t.Fatalf("seed wallet: %v", err)
	}
	SetK(ConfKey("rate_float_USDT_CNY"), "7.2")

	trade, err := BuildTrade(OrderParams{TradeType: UsdtTrc20, Fiat: CNY, Money: decimal.NewFromInt(25)})
	if err != nil {
		t.Fatalf("BuildTrade: %v", err)
	}
	if !trade.Rate.Equal(decimal.RequireFromString("7.2")) || trade.Amount != "3.47" {
		t.Fatalf("rate %v amount %s, want 7.2 / 3.47", trade.Rate, trade.Amount)
	}
}
