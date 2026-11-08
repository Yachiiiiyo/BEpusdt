import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chainOfTradeType,
  validateAddress,
  isValidTronAddress,
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidAptosAddress,
  isValidTonAddress,
} from '../src/lib/wallet.ts'

// 说明：示例地址均为公开示例或构造出来的格式合法串，不含任何真实私有信息

test('chainOfTradeType 交易类型分链', () => {
  assert.equal(chainOfTradeType('tron.trx'), 'tron')
  assert.equal(chainOfTradeType('usdt.trc20'), 'tron')
  assert.equal(chainOfTradeType('usdc.trc20'), 'tron')
  assert.equal(chainOfTradeType('usdt.solana'), 'solana')
  assert.equal(chainOfTradeType('usdc.solana'), 'solana')
  assert.equal(chainOfTradeType('usdt.aptos'), 'aptos')
  assert.equal(chainOfTradeType('usdc.aptos'), 'aptos')
  assert.equal(chainOfTradeType('usdt.ton'), 'ton')
  assert.equal(chainOfTradeType('ton.gram'), 'ton')
  assert.equal(chainOfTradeType('ethereum.eth'), 'evm')
  assert.equal(chainOfTradeType('bsc.bnb'), 'evm')
  assert.equal(chainOfTradeType('usdt.erc20'), 'evm')
  assert.equal(chainOfTradeType('usdt.bep20'), 'evm')
  assert.equal(chainOfTradeType('usdt.polygon'), 'evm')
  assert.equal(chainOfTradeType('未知类型'), 'evm') // 与后端 default 分支一致
})

test('TRON 地址校验（usdt.trc20）', () => {
  assert.equal(isValidTronAddress('T' + 'Q'.repeat(33)), true)
  assert.equal(validateAddress('usdt.trc20', 'T' + 'Q'.repeat(33)), true)
  assert.equal(validateAddress('tron.trx', 'T9yD22AtWmtKFnL9P9dEvfCe4abcdEFGH2'), true)
  // 长度不足 / 错误前缀
  assert.equal(validateAddress('usdt.trc20', 'T' + 'Q'.repeat(32)), false)
  assert.equal(validateAddress('usdt.trc20', '0x' + 'a'.repeat(40)), false)
})

test('EVM 地址校验（usdt.erc20 等）', () => {
  assert.equal(isValidEvmAddress('0x' + 'a'.repeat(40)), true)
  assert.equal(validateAddress('ethereum.eth', '0x' + 'a'.repeat(40)), true)
  assert.equal(validateAddress('usdt.bep20', '0x' + 'F'.repeat(40)), true)
  // 长度不足 / 缺前缀 / 非 hex
  assert.equal(validateAddress('usdt.erc20', '0x' + 'a'.repeat(39)), false)
  assert.equal(validateAddress('usdt.erc20', 'a'.repeat(40)), false)
  assert.equal(validateAddress('usdt.erc20', '0x' + 'g'.repeat(40)), false)
})

test('Solana 地址校验（usdt.solana）', () => {
  // 32 个前导 '1' 解码后为 32 个 0 字节
  assert.equal(isValidSolanaAddress('1'.repeat(32)), true)
  // 公开的示例地址（Wrapped SOL 合约），base58 解码为 32 字节
  assert.equal(
    validateAddress('usdt.solana', 'So11111111111111111111111111111111111111112'),
    true,
  )
  // 非 base58 字符集 / 解码长度不为 32 字节
  assert.equal(validateAddress('usdt.solana', '0OIl'), false)
  assert.equal(validateAddress('usdt.solana', '2' + '1'.repeat(31)), false)
})

test('Aptos 地址校验（usdt.aptos）', () => {
  assert.equal(isValidAptosAddress('a'.repeat(64)), true)
  assert.equal(validateAddress('usdt.aptos', '0x' + 'a'.repeat(64)), true)
  assert.equal(validateAddress('usdc.aptos', '0X' + 'F'.repeat(64)), true)
  // 长度不足 / 非 hex
  assert.equal(validateAddress('usdt.aptos', '0x' + 'a'.repeat(63)), false)
  assert.equal(validateAddress('usdt.aptos', '0x' + 'g'.repeat(64)), false)
})

test('TON 地址校验（usdt.ton / ton.gram）', () => {
  assert.equal(isValidTonAddress('UQ' + 'A'.repeat(46)), true)
  assert.equal(validateAddress('usdt.ton', 'UQ' + 'A'.repeat(46)), true)
  assert.equal(validateAddress('ton.gram', 'UQ' + 'a'.repeat(46)), true)
  // EQ 前缀 / 长度不足
  assert.equal(validateAddress('usdt.ton', 'EQ' + 'A'.repeat(46)), false)
  assert.equal(validateAddress('usdt.ton', 'UQ' + 'A'.repeat(45)), false)
})

test('空地址与空白地址', () => {
  assert.equal(validateAddress('usdt.trc20', ''), false)
  assert.equal(validateAddress('usdt.trc20', '   '), false)
})
