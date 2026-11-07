package model

import (
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/btcsuite/btcd/btcutil/hdkeychain"
	"github.com/v03413/bepusdt/app/conf"
	"github.com/v03413/bepusdt/app/utils"
	"gorm.io/gorm"
)

type DerivedAddress struct {
	Id
	DeriveIndex    int64     `gorm:"column:derive_index;type:bigint;not null;default:0;uniqueIndex:idx_derived_key_index,priority:2;comment:派生索引" json:"derive_index"`
	KeyFingerprint string    `gorm:"column:key_fingerprint;type:varchar(32);not null;uniqueIndex:idx_derived_key_index,priority:1;comment:密钥指纹" json:"key_fingerprint"`
	Address        string    `gorm:"column:address;type:varchar(128);not null;default:'';comment:收款地址" json:"address"`
	MatchAddr      string    `gorm:"column:match_addr;type:varchar(128);not null;uniqueIndex;comment:匹配地址" json:"match_addr"`
	TradeType      TradeType `gorm:"column:trade_type;type:varchar(20);not null;default:'';comment:首次分配的交易类型" json:"trade_type"`
	OrderId        string    `gorm:"column:order_id;type:varchar(128);not null;default:'';index;comment:商户订单号" json:"order_id"`
	AutoTimeAt
}

type hdState struct {
	derivator  *utils.HD
	tradeTypes map[TradeType]struct{}
	allEvm     bool
}

// hdCurrent HD 全局状态，测试中可直接替换并还原
var hdCurrent hdState

func (d *DerivedAddress) TableName() string {
	return "bep_derived_address"
}

// InitHD 从环境变量初始化 HD 派生，助记词读取后立即从环境中移除。
func InitHD() error {
	mnemonic := os.Getenv("HD_MNEMONIC")
	_ = os.Unsetenv("HD_MNEMONIC")
	mnemonic = strings.Join(strings.Fields(mnemonic), " ")
	rawTypes := strings.TrimSpace(os.Getenv("HD_TRADE_TYPES"))
	hdCurrent = hdState{}

	if rawTypes != "" && mnemonic == "" {
		return errors.New("已配置 HD_TRADE_TYPES，但 HD_MNEMONIC 为空")
	}
	if mnemonic == "" {
		return nil
	}

	derivator, err := utils.NewHD(mnemonic)
	if err != nil {
		return err
	}

	state := hdState{derivator: derivator, tradeTypes: make(map[TradeType]struct{})}
	if rawTypes != "" {
		for _, item := range strings.Split(rawTypes, ",") {
			item = strings.TrimSpace(item)
			if item == "evm" {
				state.allEvm = true
				continue
			}

			t := TradeType(item)
			if !IsEvmTradeType(t) {
				return fmt.Errorf("HD_TRADE_TYPES 包含未知或非 EVM 交易类型：%s", item)
			}
			state.tradeTypes[t] = struct{}{}
		}
	}

	hdCurrent = state

	return nil
}

func IsEvmTradeType(t TradeType) bool {
	c, ok := registry[t]
	if !ok {
		return false
	}

	switch c.Network {
	case conf.Ethereum, conf.Bsc, conf.Polygon, conf.Arbitrum, conf.Base, conf.Xlayer, conf.Plasma:
		return true
	default:
		return false
	}
}

func IsHdTradeType(t TradeType) bool {
	_, ok := currentHD(t)

	return ok
}

func currentHD(t TradeType) (*utils.HD, bool) {
	if hdCurrent.derivator == nil {
		return nil, false
	}
	if hdCurrent.allEvm {
		return hdCurrent.derivator, IsEvmTradeType(t)
	}

	_, ok := hdCurrent.tradeTypes[t]
	return hdCurrent.derivator, ok
}

func GetHdTradeTypes() []string {
	items := make([]string, 0)
	if hdCurrent.derivator == nil {
		return items
	}
	if hdCurrent.allEvm {
		for t := range registry {
			if IsEvmTradeType(t) {
				items = append(items, string(t))
			}
		}
	} else {
		for t := range hdCurrent.tradeTypes {
			items = append(items, string(t))
		}
	}
	sort.Strings(items)

	return items
}

func derivedWallet(record DerivedAddress, t TradeType) Wallet {
	return Wallet{
		Name:      "hd",
		Address:   record.Address,
		MatchAddr: record.MatchAddr,
		TradeType: string(t),
		Derived:   true,
	}
}

// allocateDerivedWallet 用数据库自增 ID 分配索引，事务失败不会留下占位记录。
func allocateDerivedWallet(t TradeType, orderId string) (Wallet, error) {
	h, ok := currentHD(t)
	if !ok {
		return Wallet{}, fmt.Errorf("%s 未启用 HD 派生", t)
	}

	nonce, err := utils.GenerateTradeId()
	if err != nil {
		return Wallet{}, err
	}
	pending := "pending:" + nonce
	record := DerivedAddress{
		KeyFingerprint: pending,
		MatchAddr:      pending,
		TradeType:      t,
		OrderId:        orderId,
	}

	err = Db.Transaction(func(db *gorm.DB) error {
		if err := db.Create(&record).Error; err != nil {
			return err
		}
		if record.ID <= 0 || record.ID >= int64(hdkeychain.HardenedKeyStart) {
			return errors.New("HD 派生索引超出非硬化范围")
		}

		address, matchAddr, err := h.DeriveAddress(uint32(record.ID))
		if err != nil {
			return err
		}
		record.DeriveIndex = record.ID
		record.KeyFingerprint = h.KeyFingerprint()
		record.Address = address
		record.MatchAddr = matchAddr

		return db.Model(&record).Updates(map[string]any{
			"derive_index":    record.DeriveIndex,
			"key_fingerprint": record.KeyFingerprint,
			"address":         record.Address,
			"match_addr":      record.MatchAddr,
		}).Error
	})
	if err != nil {
		return Wallet{}, fmt.Errorf("HD 地址分配失败：%w", err)
	}

	return derivedWallet(record, t), nil
}

func reuseDerivedWallet(reuse *Order, t TradeType) (Wallet, bool, error) {
	h, ok := currentHD(t)
	if !ok || reuse == nil || reuse.MatchAddress == "" {
		return Wallet{}, false, nil
	}

	var record DerivedAddress
	res := Db.Where("match_addr = ? and key_fingerprint = ?", strings.ToLower(reuse.MatchAddress), h.KeyFingerprint()).Limit(1).Find(&record)
	if res.Error != nil {
		return Wallet{}, false, res.Error
	}
	if res.RowsAffected == 0 {
		return Wallet{}, false, nil
	}

	return derivedWallet(record, t), true, nil
}
