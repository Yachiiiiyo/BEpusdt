import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asArray, toKeys, toOptions } from '../src/lib/trade-meta.ts'
import { toListResult } from '../src/api/list-result.ts'

// 形状取自 app/model/registry.go 的 GetAllAlias / GetAllNetwork / GetSupportFiat / GetSupportCrypto
test('trade_type：交易类型 -> 别名，按键排序，label 取别名', () => {
  const opts = toOptions({ 'usdt.trc20': 'USDT-TRC20', 'tron.trx': 'TRX' })
  assert.deepEqual(opts, [
    { value: 'tron.trx', label: 'TRX' },
    { value: 'usdt.trc20', label: 'USDT-TRC20' },
  ])
})

test('trade_fiat：法币代码为键、值是空对象，label 回退为键', () => {
  assert.deepEqual(toKeys({ USD: {}, CNY: {} }), ['CNY', 'USD'])
  assert.deepEqual(toOptions({ CNY: {} }), [{ value: 'CNY', label: 'CNY' }])
})

test('trade_crypto：币种代码为键、值为 CoinId', () => {
  assert.deepEqual(toKeys({ USDT: 'tether', TRX: 'tron' }), ['TRX', 'USDT'])
})

test('兼容数组、null、undefined、非法类型，永远返回数组', () => {
  assert.deepEqual(toKeys(['CNY', 'USD']), ['CNY', 'USD'])
  assert.deepEqual(toKeys(null), [])
  assert.deepEqual(toKeys(undefined), [])
  assert.deepEqual(toOptions('oops'), [])
  assert.deepEqual(toOptions(42), [])
})

test('asArray：null / 缺失 / 对象都兜底为 []', () => {
  assert.deepEqual(asArray(null), [])
  assert.deepEqual(asArray(undefined), [])
  assert.deepEqual(asArray({ a: 1 }), [])
  assert.deepEqual(asArray([1, 2]), [1, 2])
})

test('toListResult：空列表 data 为 null 或缺失时得到 []，total 缺失为 0', () => {
  assert.deepEqual(toListResult({ code: 200, data: null as unknown as never[], total: 0 }), { data: [], total: 0 })
  assert.deepEqual(toListResult({ code: 200 } as never), { data: [], total: 0 })
  assert.deepEqual(toListResult({ code: 200, data: [{ id: 1 }], total: 7 }), { data: [{ id: 1 }], total: 7 })
})
