/**
 * 钱包地址校验纯函数（不依赖 React / i18n / vite 别名，便于单元测试）
 *
 * 规则来源：app/model/wallet.go Validate() + app/utils/{utils,ton}.go
 * 各链校验与后端保持一致：
 * - tron.trx / usdt.trc20 / usdc.trc20       → ^T[a-zA-Z0-9]{33}$
 * - usdt.solana / usdc.solana                → base58 解码后长度为 32 字节
 * - usdt.aptos / usdc.aptos                  → 可选 0x/0X 前缀 + 64 位 hex
 * - usdt.ton / ton.gram                      → UQ 开头的 TON 地址（48 字符 base64url）
 * - 其余（bsc.bnb、ethereum.eth、usdt.erc20 等 EVM 链）→ 0x + 40 位 hex
 */

export type WalletChain = 'tron' | 'solana' | 'aptos' | 'ton' | 'evm'

const TRON_TYPES = new Set(['tron.trx', 'usdt.trc20', 'usdc.trc20'])
const SOLANA_TYPES = new Set(['usdt.solana', 'usdc.solana'])
const APTOS_TYPES = new Set(['usdt.aptos', 'usdc.aptos'])
const TON_TYPES = new Set(['usdt.ton', 'ton.gram'])

/** 交易类型 → 地址所属链（与后端 model.Wallet.Validate 的 switch 一一对应） */
export function chainOfTradeType(tradeType: string): WalletChain {
  if (TRON_TYPES.has(tradeType)) return 'tron'
  if (SOLANA_TYPES.has(tradeType)) return 'solana'
  if (APTOS_TYPES.has(tradeType)) return 'aptos'
  if (TON_TYPES.has(tradeType)) return 'ton'
  // default 分支：所有 EVM 系链（ethereum.eth / bsc.bnb / usdt.erc20 / ...）
  return 'evm'
}

/** TRON：^T[a-zA-Z0-9]{33}$（app/utils/utils.go IsValidTronAddress） */
export function isValidTronAddress(address: string): boolean {
  return /^T[a-zA-Z0-9]{33}$/.test(address)
}

/** EVM：0x + 40 位 hex（app/utils/utils.go IsValidEvmAddress） */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

/** Aptos：可选 0x/0X 前缀 + 64 位 hex（app/utils/utils.go IsValidAptosAddress） */
export function isValidAptosAddress(address: string): boolean {
  const stripped = address.replace(/^0[xX]/, '')
  return /^[0-9a-fA-F]{64}$/.test(stripped)
}

/** TON：UQ 开头，48 字符 base64url（app/utils/ton.go IsValidTonAddress 的前端近似） */
export function isValidTonAddress(address: string): boolean {
  return /^UQ[A-Za-z0-9_-]{46}$/.test(address)
}

/** base58 解码长度（不做严格校验，非法字符返回 -1） */
function base58DecodedLength(value: string): number {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const digits: number[] = []
  for (const ch of value) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) return -1
    let carry = idx
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] * 58
      digits[i] = carry % 256
      carry = Math.floor(carry / 256)
    }
    while (carry > 0) {
      digits.push(carry % 256)
      carry = Math.floor(carry / 256)
    }
  }
  // 前导 '1' 对应前导 0 字节
  let leadingZeros = 0
  for (let i = 0; i < value.length && value[i] === '1'; i++) leadingZeros++
  return digits.length + leadingZeros
}

/** Solana：base58 解码后 32 字节（app/utils/utils.go IsValidSolanaAddress） */
export function isValidSolanaAddress(address: string): boolean {
  if (address.length === 0) return false
  return base58DecodedLength(address) === 32
}

/**
 * 按链类型校验钱包地址（规则与后端 model.Wallet.Validate 一致）
 * @returns 合法返回 true
 */
export function validateAddress(tradeType: string, address: string): boolean {
  const trimmed = address.trim()
  if (!trimmed) return false
  switch (chainOfTradeType(tradeType)) {
    case 'tron':
      return isValidTronAddress(trimmed)
    case 'solana':
      return isValidSolanaAddress(trimmed)
    case 'aptos':
      return isValidAptosAddress(trimmed)
    case 'ton':
      return isValidTonAddress(trimmed)
    case 'evm':
      return isValidEvmAddress(trimmed)
  }
}
