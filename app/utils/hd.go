package utils

// HD 仅用于派生收款地址；归集、签名和广播不在本服务内，应由独立工具持有助记词并按 derive_index 派生。

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/btcsuite/btcd/btcutil/hdkeychain"
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/tyler-smith/go-bip39"
	"golang.org/x/crypto/sha3"
)

// HD 只保留 m/44'/60'/0'/0 层的扩展私钥。
type HD struct {
	account     *hdkeychain.ExtendedKey
	fingerprint string
}

func NewHD(mnemonic string) (*HD, error) {
	mnemonic = strings.Join(strings.Fields(mnemonic), " ")
	if !bip39.IsMnemonicValid(mnemonic) {
		return nil, errors.New("HD_MNEMONIC 助记词无效")
	}

	seed := bip39.NewSeed(mnemonic, "")
	defer clear(seed)

	key, err := hdkeychain.NewMaster(seed, &chaincfg.MainNetParams)
	if err != nil {
		return nil, errors.New("HD 主密钥初始化失败")
	}

	path := []uint32{
		44 + hdkeychain.HardenedKeyStart,
		60 + hdkeychain.HardenedKeyStart,
		hdkeychain.HardenedKeyStart,
		0,
	}
	for _, index := range path {
		child, err := key.Derive(index)
		if err != nil {
			key.Zero()
			return nil, errors.New("HD 派生路径初始化失败")
		}
		key.Zero()
		key = child
	}

	h := &HD{account: key}
	_, lower, err := h.DeriveAddress(0)
	if err != nil {
		key.Zero()
		return nil, err
	}
	fingerprint := sha256.Sum256([]byte(lower))
	h.fingerprint = hex.EncodeToString(fingerprint[:])[:16]

	return h, nil
}

// DeriveAddress 派生 m/44'/60'/0'/0/n，返回 EIP-55 地址和小写匹配地址。
func (h *HD) DeriveAddress(index uint32) (string, string, error) {
	if index >= hdkeychain.HardenedKeyStart {
		return "", "", errors.New("HD 派生索引超出非硬化范围")
	}

	key, err := h.account.Derive(index)
	if err != nil {
		return "", "", errors.New("HD 地址派生失败")
	}
	defer key.Zero()

	pub, err := key.ECPubKey()
	if err != nil {
		return "", "", errors.New("HD 公钥计算失败")
	}
	serialized := pub.SerializeUncompressed()
	hash := keccak256(serialized[1:])
	lower := hex.EncodeToString(hash[len(hash)-20:])
	address := eip55Address(lower)

	return address, "0x" + lower, nil
}

func (h *HD) KeyFingerprint() string {
	return h.fingerprint
}

func keccak256(data []byte) []byte {
	h := sha3.NewLegacyKeccak256()
	_, _ = h.Write(data)

	return h.Sum(nil)
}

func eip55Address(lower string) string {
	address := []byte(lower)
	hash := keccak256([]byte(lower))
	for i, c := range address {
		if c < 'a' || c > 'f' {
			continue
		}

		nibble := hash[i/2]
		if i%2 == 0 {
			nibble >>= 4
		} else {
			nibble &= 0x0f
		}
		if nibble >= 8 {
			address[i] = c - ('a' - 'A')
		}
	}

	return "0x" + string(address)
}
