package utils

import (
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
	"github.com/tyler-smith/go-bip39"
)

// 测试助记词全部运行时生成，不使用任何硬编码助记词或私钥

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

// compactSignature 将 r/s/recid 组装成 btcec 的紧凑签名格式
func compactSignature(r, s *big.Int, recid byte) []byte {
	sig := make([]byte, 65)
	sig[0] = 27 + recid
	copyLeftPadded(sig[1:33], r.Bytes())
	copyLeftPadded(sig[33:65], s.Bytes())

	return sig
}

func keccakAddress(pubSerializedUncompressed []byte) string {
	h := keccak256(pubSerializedUncompressed[1:])

	return "0x" + hex.EncodeToString(h[12:])
}

func TestSignLegacyTxRecoverSender(t *testing.T) {
	h, err := NewHD(newTestMnemonic(t))
	if err != nil {
		t.Fatalf("new hd: %v", err)
	}

	for _, index := range []uint32{0, 1, 2, 37} {
		checksum, lower, err := h.DeriveAddress(index)
		if err != nil {
			t.Fatalf("derive %d: %v", index, err)
		}

		tx := LegacyTx{
			Nonce:    uint64(index) * 3,
			GasPrice: big.NewInt(3_000_000_000),
			Value:    big.NewInt(123456789),
			Gas:      21000,
			To:       mustHex(t, "55d398326f99059ff775485246999027b3197955"),
			Data:     nil,
			ChainID:  56,
		}
		raw, hash, err := h.SignLegacyTx(index, tx)
		if err != nil {
			t.Fatalf("sign %d: %v", index, err)
		}

		// 交易哈希必须等于 keccak256(raw)
		if hash != "0x"+hex.EncodeToString(keccak256(raw)) {
			t.Fatalf("index %d: hash mismatch", index)
		}
		if strings.ToLower(hash) != hash {
			t.Fatalf("index %d: hash not lowercase", index)
		}

		decoded, err := DecodeLegacyTx(raw)
		if err != nil {
			t.Fatalf("decode %d: %v", index, err)
		}

		// RLP 解码回字段与输入一致
		if decoded.Nonce != tx.Nonce || decoded.Gas != tx.Gas ||
			decoded.GasPrice.Cmp(tx.GasPrice) != 0 || decoded.Value.Cmp(tx.Value) != 0 ||
			hex.EncodeToString(decoded.To) != hex.EncodeToString(tx.To) ||
			hex.EncodeToString(decoded.Data) != hex.EncodeToString(tx.Data) ||
			decoded.ChainID != tx.ChainID {
			t.Fatalf("index %d: decoded mismatch: %+v", index, decoded)
		}

		// v = recid + chainId*2 + 35
		if decoded.V < 35+tx.ChainID*2 || decoded.V > 35+tx.ChainID*2+3 {
			t.Fatalf("index %d: v out of range: %d", index, decoded.V)
		}
		recid := byte(decoded.V - 35 - tx.ChainID*2)

		// 用签名哈希恢复公钥，地址必须等于派生地址
		signingHash := LegacySigningHash(&tx)
		pub, _, err := ecdsa.RecoverCompact(compactSignature(decoded.R, decoded.S, recid), signingHash)
		if err != nil {
			t.Fatalf("index %d: recover: %v", index, err)
		}
		recovered := keccakAddress(pub.SerializeUncompressed())
		if recovered != lower {
			t.Fatalf("index %d: recovered %s != derived %s", index, recovered, lower)
		}
		if strings.ToLower(checksum) != lower {
			t.Fatalf("index %d: checksum/lower mismatch", index)
		}
	}
}

func TestSignLegacyTxChainIDAffectsSignature(t *testing.T) {
	h, err := NewHD(newTestMnemonic(t))
	if err != nil {
		t.Fatalf("new hd: %v", err)
	}

	tx := LegacyTx{
		Nonce:    7,
		GasPrice: big.NewInt(1_000_000_000),
		Value:    big.NewInt(1),
		Gas:      21000,
		To:       mustHex(t, "0000000000000000000000000000000000000001"),
		ChainID:  56,
	}

	raw56, hash56, err := h.SignLegacyTx(1, tx)
	if err != nil {
		t.Fatalf("sign 56: %v", err)
	}
	tx.ChainID = 1
	raw1, hash1, err := h.SignLegacyTx(1, tx)
	if err != nil {
		t.Fatalf("sign 1: %v", err)
	}

	if hash56 == hash1 {
		t.Fatal("chainId 56 and 1 should produce different hashes")
	}

	d56, err := DecodeLegacyTx(raw56)
	if err != nil {
		t.Fatalf("decode 56: %v", err)
	}
	d1, err := DecodeLegacyTx(raw1)
	if err != nil {
		t.Fatalf("decode 1: %v", err)
	}
	if d56.ChainID != 56 || d1.ChainID != 1 {
		t.Fatalf("chainId mismatch: %d %d", d56.ChainID, d1.ChainID)
	}
	if d56.V == d1.V || d56.R.Cmp(d1.R) == 0 {
		t.Fatal("signature should differ between chains")
	}
}

func TestRlpEncodingEdgeCases(t *testing.T) {
	// 空串、单字节短串、0、大整数
	cases := []struct {
		enc []byte
		dec *big.Int
	}{
		{rlpEncodeBigInt(nil), big.NewInt(0)},
		{rlpEncodeBigInt(big.NewInt(0)), big.NewInt(0)},
		{rlpEncodeBigInt(big.NewInt(1)), big.NewInt(1)},       // 单字节 0x01
		{rlpEncodeBigInt(big.NewInt(0x80)), big.NewInt(0x80)}, // 需要长度前缀
		{rlpEncodeBigInt(new(big.Int).Lsh(big.NewInt(1), 200)), new(big.Int).Lsh(big.NewInt(1), 200)},
	}
	for _, c := range cases {
		item, rest, err := rlpDecodeOne(c.enc)
		if err != nil || len(rest) != 0 {
			t.Fatalf("decode error: %v %v", err, rest)
		}
		if bytesToBigInt(item.bytes).Cmp(c.dec) != 0 {
			t.Fatalf("roundtrip mismatch: %s != %s", bytesToBigInt(item.bytes), c.dec)
		}
	}

	// 单字节 0x80 编码应为 0x81 0x80
	if got := rlpEncodeBytes([]byte{0x80}); len(got) != 2 || got[0] != 0x81 || got[1] != 0x80 {
		t.Fatalf("0x80 encode: %x", got)
	}

	// RecoverLegacyTxSender 与 SignLegacyTx 一致
	h, _ := NewHD(newTestMnemonic(t))
	_, lower, _ := h.DeriveAddress(5)
	tx := LegacyTx{
		Nonce:    9,
		GasPrice: big.NewInt(2_000_000_000),
		Value:    big.NewInt(99),
		Gas:      100000,
		To:       mustHex(t, "55d398326f99059ff775485246999027b3197955"),
		Data:     Erc20TransferData(mustHex(t, "0000000000000000000000000000000000000009"), big.NewInt(10)),
		ChainID:  56,
	}
	raw, _, err := h.SignLegacyTx(5, tx)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	sender, err := RecoverLegacyTxSender(raw)
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	if sender != lower {
		t.Fatalf("sender %s != %s", sender, lower)
	}
}

func TestErc20Calldata(t *testing.T) {
	to := mustHex(t, "55d398326f99059ff775485246999027b3197955")
	data := Erc20TransferData(to, big.NewInt(15))
	if len(data) != 68 {
		t.Fatalf("transfer calldata length = %d", len(data))
	}
	if hex.EncodeToString(data[:4]) != "a9059cbb" {
		t.Fatalf("transfer selector: %x", data[:4])
	}
	if hex.EncodeToString(data[4:36]) != "00000000000000000000000055d398326f99059ff775485246999027b3197955" {
		t.Fatalf("transfer to: %x", data[4:36])
	}
	zeros := make([]byte, 31)
	if string(data[36:67]) != string(zeros) || data[67] != 15 {
		t.Fatalf("transfer amount: %x", data[36:68])
	}

	owner := mustHex(t, "0000000000000000000000000000000000000001")
	bal := Erc20BalanceOfData(owner)
	if len(bal) != 36 || hex.EncodeToString(bal[:4]) != "70a08231" {
		t.Fatalf("balanceOf calldata: %x", bal)
	}
}

func mustHex(t *testing.T, s string) []byte {
	t.Helper()

	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatalf("hex decode: %v", err)
	}

	return b
}
