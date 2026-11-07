package utils

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/btcsuite/btcd/btcec/v2/ecdsa"
)

// hdkeychainHardened 非硬化索引上限，与 hdkeychain.HardenedKeyStart 一致
const hdkeychainHardened = 1 << 31

// LegacyTx EIP-155 前遗留交易（legacy transaction），仅支持本服务归集所需的字段。
type LegacyTx struct {
	Nonce    uint64
	GasPrice *big.Int
	Value    *big.Int
	Gas      uint64
	To       []byte // 20 字节目标地址
	Data     []byte
	ChainID  uint64
}

// DecodedTx 已签名 legacy 交易解码结果，用于校验和 mock 节点。
type DecodedTx struct {
	Nonce    uint64
	GasPrice *big.Int
	Value    *big.Int
	Gas      uint64
	To       []byte
	Data     []byte
	ChainID  uint64
	V        uint64
	R        *big.Int
	S        *big.Int
}

// ---------- 最小 RLP 编码（只支持 []byte / 大整数 / 列表） ----------

func rlpHeader(length int, offset byte) []byte {
	if length < 56 {
		return []byte{offset + byte(length)}
	}

	payload := uintToMinimalBytes(uint64(length))
	head := []byte{offset + 55 + byte(len(payload))}

	return append(head, payload...)
}

// rlpEncodeBytes 字符串编码：单字节小于 0x80 直接返回自身，否则加长度前缀
func rlpEncodeBytes(b []byte) []byte {
	if len(b) == 1 && b[0] < 0x80 {

		return b
	}

	return append(rlpHeader(len(b), 0x80), b...)
}

func rlpEncodeUint(n uint64) []byte {

	return rlpEncodeBytes(uintToMinimalBytes(n))
}

func rlpEncodeBigInt(v *big.Int) []byte {
	if v == nil || v.Sign() <= 0 {

		return rlpEncodeBytes(nil)
	}

	return rlpEncodeBytes(v.Bytes())
}

func rlpEncodeList(items ...[]byte) []byte {
	var payload []byte
	for _, item := range items {
		payload = append(payload, item...)
	}

	return append(rlpHeader(len(payload), 0xc0), payload...)
}

func uintToMinimalBytes(n uint64) []byte {
	if n == 0 {

		return nil
	}

	var buf [8]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte(n)
		n >>= 8
	}

	return buf[i:]
}

// ---------- 最小 RLP 解码 ----------

type rlpItem struct {
	isList bool
	bytes  []byte
	list   []rlpItem
}

func rlpDecodeOne(data []byte) (rlpItem, []byte, error) {
	if len(data) == 0 {
		return rlpItem{}, nil, errors.New("RLP 数据为空")
	}

	prefix := data[0]
	switch {
	case prefix < 0x80: // 单字节字符串
		return rlpItem{bytes: data[:1]}, data[1:], nil
	case prefix <= 0xb7: // 短字符串
		length := int(prefix - 0x80)
		if len(data) < 1+length {
			return rlpItem{}, nil, errors.New("RLP 短字符串长度越界")
		}

		return rlpItem{bytes: data[1 : 1+length]}, data[1+length:], nil
	case prefix <= 0xbf: // 长字符串
		lenLen := int(prefix - 0xb7)
		if len(data) < 1+lenLen {
			return rlpItem{}, nil, errors.New("RLP 长字符串长度头越界")
		}
		length := 0
		for _, b := range data[1 : 1+lenLen] {
			length = length<<8 | int(b)
		}
		if len(data) < 1+lenLen+length {
			return rlpItem{}, nil, errors.New("RLP 长字符串长度越界")
		}

		return rlpItem{bytes: data[1+lenLen : 1+lenLen+length]}, data[1+lenLen+length:], nil
	case prefix <= 0xf7: // 短列表
		length := int(prefix - 0xc0)
		if len(data) < 1+length {
			return rlpItem{}, nil, errors.New("RLP 短列表长度越界")
		}

		return rlpDecodeListContent(data[1 : 1+length]), data[1+length:], nil
	default: // 长列表
		lenLen := int(prefix - 0xf7)
		if len(data) < 1+lenLen {
			return rlpItem{}, nil, errors.New("RLP 长列表长度头越界")
		}
		length := 0
		for _, b := range data[1 : 1+lenLen] {
			length = length<<8 | int(b)
		}
		if len(data) < 1+lenLen+length {
			return rlpItem{}, nil, errors.New("RLP 长列表长度越界")
		}

		return rlpDecodeListContent(data[1+lenLen : 1+lenLen+length]), data[1+lenLen+length:], nil
	}
}

func rlpDecodeListContent(content []byte) rlpItem {
	var item = rlpItem{isList: true}
	for len(content) > 0 {
		child, rest, err := rlpDecodeOne(content)
		if err != nil {
			// 上层已经按长度截断，理论上不会失败
			break
		}
		item.list = append(item.list, child)
		content = rest
	}

	return item
}

// Keccak256 导出哈希函数（无密钥信息），供交易哈希计算与测试 mock 使用
func Keccak256(data []byte) []byte {
	return keccak256(data)
}

// ---------- 交易编码与签名 ----------

// txContentFields 返回参与签名的交易字段编码（不含签名）
func (tx *LegacyTx) txContentFields() [][]byte {

	return [][]byte{
		rlpEncodeUint(tx.Nonce),
		rlpEncodeBigInt(tx.GasPrice),
		rlpEncodeUint(tx.Gas),
		rlpEncodeBytes(tx.To),
		rlpEncodeBigInt(tx.Value),
		rlpEncodeBytes(tx.Data),
	}
}

// LegacySigningHash 计算 EIP-155 签名哈希：keccak256(rlp([nonce, gasPrice, gas, to, value, data, chainId, 0, 0]))
func LegacySigningHash(tx *LegacyTx) []byte {
	fields := tx.txContentFields()
	fields = append(fields, rlpEncodeUint(tx.ChainID), rlpEncodeBytes(nil), rlpEncodeBytes(nil))

	return keccak256(rlpEncodeList(fields...))
}

// SignLegacyTx 派生 m/44'/60'/0'/0/index 私钥并对 EIP-155 legacy 交易签名，
// 返回 RLP 编码的已签名原始交易和 0x 小写交易哈希。私钥仅在内存中临时存在，用完立即清零。
func (h *HD) SignLegacyTx(index uint32, tx LegacyTx) ([]byte, string, error) {
	if index >= hdkeychainHardened {
		return nil, "", errors.New("HD 派生索引超出非硬化范围")
	}
	if len(tx.To) != 20 {
		return nil, "", errors.New("legacy 交易目标地址长度必须为 20 字节")
	}

	key, err := h.account.Derive(index)
	if err != nil {
		return nil, "", errors.New("HD 签名私钥派生失败")
	}
	defer key.Zero()

	priv, err := key.ECPrivKey()
	if err != nil {
		return nil, "", errors.New("HD 签名私钥解析失败")
	}
	defer priv.Key.Zero()

	hash := LegacySigningHash(&tx)

	// 头部字节为 27+recid，后 64 字节为 R||S
	compact := ecdsa.SignCompact(priv, hash, false)
	recid := compact[0] - 27
	v := uint64(recid) + tx.ChainID*2 + 35
	r := new(big.Int).SetBytes(compact[1:33])
	s := new(big.Int).SetBytes(compact[33:65])

	fields := tx.txContentFields()
	fields = append(fields, rlpEncodeUint(v), rlpEncodeBigInt(r), rlpEncodeBigInt(s))
	raw := rlpEncodeList(fields...)

	return raw, "0x" + hexEncode(keccak256(raw)), nil
}

// DecodeLegacyTx 解码已签名的 legacy 交易（不含 sender 恢复）
func DecodeLegacyTx(raw []byte) (*DecodedTx, error) {
	item, rest, err := rlpDecodeOne(raw)
	if err != nil {
		return nil, err
	}
	if len(rest) != 0 {
		return nil, errors.New("RLP 解码后存在多余数据")
	}
	if !item.isList || len(item.list) != 9 {
		return nil, errors.New("legacy 交易 RLP 结构不合法")
	}

	tx := &DecodedTx{
		Nonce:    bytesToUint(item.list[0].bytes),
		GasPrice: bytesToBigInt(item.list[1].bytes),
		Gas:      bytesToUint(item.list[2].bytes),
		To:       item.list[3].bytes,
		Value:    bytesToBigInt(item.list[4].bytes),
		Data:     item.list[5].bytes,
		V:        bytesToUint(item.list[6].bytes),
		R:        bytesToBigInt(item.list[7].bytes),
		S:        bytesToBigInt(item.list[8].bytes),
	}
	if tx.V >= 35 {
		tx.ChainID = (tx.V - 35) / 2
	}
	if len(tx.To) != 0 && len(tx.To) != 20 {
		return nil, errors.New("legacy 交易目标地址长度不合法")
	}

	return tx, nil
}

// RecoverLegacyTxSender 从已签名 legacy 交易中恢复签名者地址（小写）
func RecoverLegacyTxSender(raw []byte) (string, error) {
	tx, err := DecodeLegacyTx(raw)
	if err != nil {
		return "", err
	}
	if tx.V < 35 {
		return "", errors.New("legacy 交易缺少 EIP-155 签名")
	}
	recid := byte(tx.V - 35 - tx.ChainID*2)
	if recid > 3 {
		return "", errors.New("legacy 交易签名恢复码不合法")
	}

	unsigned := &LegacyTx{
		Nonce:    tx.Nonce,
		GasPrice: tx.GasPrice,
		Value:    tx.Value,
		Gas:      tx.Gas,
		To:       tx.To,
		Data:     tx.Data,
		ChainID:  tx.ChainID,
	}
	hash := LegacySigningHash(unsigned)

	var compact [65]byte
	compact[0] = 27 + recid
	copyLeftPadded(compact[1:33], tx.R.Bytes())
	copyLeftPadded(compact[33:65], tx.S.Bytes())

	pub, _, err := ecdsa.RecoverCompact(compact[:], hash)
	if err != nil {
		return "", fmt.Errorf("legacy 交易签名恢复失败：%w", err)
	}

	serialized := pub.SerializeUncompressed()
	addr := keccak256(serialized[1:])[12:]

	return "0x" + hexEncode(addr), nil
}

func copyLeftPadded(dst, src []byte) {
	for i := range dst {
		dst[i] = 0
	}
	copy(dst[len(dst)-len(src):], src)
}

func bytesToUint(b []byte) uint64 {
	var n uint64
	for _, c := range b {
		n = n<<8 | uint64(c)
	}

	return n
}

func bytesToBigInt(b []byte) *big.Int {

	return new(big.Int).SetBytes(b)
}

// ---------- ERC20 calldata ----------

var erc20TransferSelector = []byte{0xa9, 0x05, 0x9c, 0xbb}
var erc20BalanceOfSelector = []byte{0x70, 0xa0, 0x82, 0x31}

// Erc20TransferData 构造 transfer(address,uint256) calldata
func Erc20TransferData(to []byte, amount *big.Int) []byte {
	data := make([]byte, 4+32+32)
	copy(data, erc20TransferSelector)
	copyLeftPadded(data[4:36], to)
	copyLeftPadded(data[36:68], amount.Bytes())

	return data
}

// Erc20BalanceOfData 构造 balanceOf(address) calldata
func Erc20BalanceOfData(owner []byte) []byte {
	data := make([]byte, 4+32)
	copy(data, erc20BalanceOfSelector)
	copyLeftPadded(data[4:36], owner)

	return data
}

func hexEncode(b []byte) string {
	const digits = "0123456789abcdef"
	out := make([]byte, 0, len(b)*2)
	for _, c := range b {
		out = append(out, digits[c>>4], digits[c&0x0f])
	}

	return string(out)
}
