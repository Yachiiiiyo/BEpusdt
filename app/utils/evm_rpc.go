package utils

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"
)

// ReceiptStatus 交易回执三态
type ReceiptStatus int

const (
	ReceiptNotFound ReceiptStatus = iota // 未上链
	ReceiptSuccess                       // 成功
	ReceiptFailed                        // 失败（status 0x0）
)

const evmRpcTimeout = time.Second * 10

// EvmRpc 极简 JSON-RPC over HTTP 客户端，仅覆盖 HD 归集所需的调用
type EvmRpc struct {
	endpoint string
	client   *http.Client
}

func NewEvmRpc(endpoint string, client *http.Client) *EvmRpc {

	return &EvmRpc{endpoint: endpoint, client: client}
}

type rpcRequest struct {
	JsonRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

var rpcCallSeq int

func (r *EvmRpc) do(ctx context.Context, method string, params []any, result any) error {
	if r.endpoint == "" {
		return errors.New("RPC 端点为空")
	}

	rpcCallSeq++
	body, err := json.Marshal(rpcRequest{JsonRPC: "2.0", ID: rpcCallSeq, Method: method, Params: params})
	if err != nil {
		return fmt.Errorf("rpc %s 请求构造失败：%w", method, err)
	}

	c, cancel := context.WithTimeout(ctx, evmRpcTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(c, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("rpc %s 请求构造失败：%w", method, err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		// 错误信息里不保留完整 URL，只留域名
		return fmt.Errorf("rpc %s 调用失败：%s", method, SanitizeRpcError(err.Error()))
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("rpc %s 响应状态异常：%d", method, resp.StatusCode)
	}

	var payload rpcResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&payload); err != nil {
		return fmt.Errorf("rpc %s 响应解析失败：%w", method, err)
	}
	if payload.Error != nil {
		return fmt.Errorf("rpc %s 错误 %d：%s", method, payload.Error.Code, payload.Error.Message)
	}

	if result == nil {
		return nil
	}

	return json.Unmarshal(payload.Result, result)
}

// SanitizeRpcError 将错误信息中的完整 URL 缩减为域名，避免 RPC 地址（可能带 key）入库
func SanitizeRpcError(msg string) string {
	var out strings.Builder
	rest := msg
	for {
		idx := strings.Index(rest, "http")
		if idx < 0 {
			out.WriteString(rest)

			return out.String()
		}
		out.WriteString(rest[:idx])
		rest = rest[idx:]

		end := len(rest)
		for i, c := range rest {
			if c == ' ' || c == '"' || c == '\'' {
				end = i

				break
			}
		}
		urlPart := rest[:end]
		host := urlPart
		if pos := strings.Index(urlPart, "://"); pos >= 0 {
			host = urlPart[pos+3:]
			if pos := strings.IndexAny(host, "/?#@"); pos >= 0 {
				host = host[:pos]
			}
		}
		out.WriteString(host)
		rest = rest[end:]
	}
}

// GasPrice 当前 gas 价格（wei）
func (r *EvmRpc) GasPrice(ctx context.Context) (*big.Int, error) {
	var result string
	if err := r.do(ctx, "eth_gasPrice", nil, &result); err != nil {
		return nil, err
	}

	return parseHexQuantity(result)
}

// GetBalance 账户原生币余额（wei）
func (r *EvmRpc) GetBalance(ctx context.Context, address string) (*big.Int, error) {
	var result string
	if err := r.do(ctx, "eth_getBalance", []any{strings.ToLower(address), "latest"}, &result); err != nil {
		return nil, err
	}

	return parseHexQuantity(result)
}

// GetNonce 账户 pending nonce
func (r *EvmRpc) GetNonce(ctx context.Context, address string) (uint64, error) {
	var result string
	if err := r.do(ctx, "eth_getTransactionCount", []any{strings.ToLower(address), "pending"}, &result); err != nil {
		return 0, err
	}

	v, err := parseHexQuantity(result)
	if err != nil {
		return 0, err
	}

	return v.Uint64(), nil
}

// CallBalanceOf 调用 ERC20 balanceOf，返回代币余额（最小单位）
func (r *EvmRpc) CallBalanceOf(ctx context.Context, token, owner string) (*big.Int, error) {
	ownerBytes, err := hex.DecodeString(strings.TrimPrefix(strings.ToLower(owner), "0x"))
	if err != nil || len(ownerBytes) != 20 {
		return nil, errors.New("balanceOf owner 地址不合法")
	}

	var result string
	if err := r.do(ctx, "eth_call", []any{
		map[string]string{
			"to":   strings.ToLower(token),
			"data": "0x" + hex.EncodeToString(Erc20BalanceOfData(ownerBytes)),
		},
		"latest",
	}, &result); err != nil {
		return nil, err
	}

	return parseHexQuantity(result)
}

// EstimateGas 估算交易 gas
func (r *EvmRpc) EstimateGas(ctx context.Context, from, to string, data []byte, value *big.Int) (uint64, error) {
	if value == nil {
		value = new(big.Int)
	}

	var result string
	if err := r.do(ctx, "eth_estimateGas", []any{
		map[string]string{
			"from":  strings.ToLower(from),
			"to":    strings.ToLower(to),
			"data":  "0x" + hex.EncodeToString(data),
			"value": "0x" + value.Text(16),
		},
		"latest",
	}, &result); err != nil {
		return 0, err
	}

	v, err := parseHexQuantity(result)
	if err != nil {
		return 0, err
	}

	return v.Uint64(), nil
}

// SendRawTransaction 广播已签名交易
func (r *EvmRpc) SendRawTransaction(ctx context.Context, raw []byte) error {

	return r.do(ctx, "eth_sendRawTransaction", []any{"0x" + hex.EncodeToString(raw)}, nil)
}

// GetReceipt 查询交易回执（未找到 / 成功 / 失败）
func (r *EvmRpc) GetReceipt(ctx context.Context, hash string) (ReceiptStatus, error) {
	var result json.RawMessage
	if err := r.do(ctx, "eth_getTransactionReceipt", []any{strings.ToLower(hash)}, &result); err != nil {
		return ReceiptNotFound, err
	}
	if len(result) == 0 || string(result) == "null" {
		return ReceiptNotFound, nil
	}

	var receipt struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(result, &receipt); err != nil {
		return ReceiptNotFound, fmt.Errorf("回执解析失败：%w", err)
	}

	switch strings.ToLower(receipt.Status) {
	case "0x1", "1":
		return ReceiptSuccess, nil
	case "0x0", "0":
		return ReceiptFailed, nil
	default:
		return ReceiptNotFound, fmt.Errorf("回执状态异常：%s", receipt.Status)
	}
}

func parseHexQuantity(s string) (*big.Int, error) {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	if s == "" {
		return new(big.Int), nil
	}

	v, ok := new(big.Int).SetString(s, 16)
	if !ok {
		return nil, errors.New("十六进制数量解析失败")
	}

	return v, nil
}
