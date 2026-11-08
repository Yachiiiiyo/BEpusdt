import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FIAT_OPTIONS,
  DEFAULT_FIAT,
  resolveFiatOptions,
  fiatSymbol,
  formatKpiAmount,
  successRatePercent,
  customRangeToFromTo,
  formatPeriodLabel,
  tokenShareRows,
  todayDateString,
} from '../src/lib/dashboard.ts'

test('resolveFiatOptions 内置列表兜底', () => {
  assert.deepEqual(resolveFiatOptions(undefined), FIAT_OPTIONS)
  assert.deepEqual(resolveFiatOptions(null), FIAT_OPTIONS)
  assert.deepEqual(resolveFiatOptions([]), FIAT_OPTIONS)
})

test('resolveFiatOptions 过滤并追加后端法币', () => {
  const opts = resolveFiatOptions(['CNY', 'USD', 'KRW'])
  assert.deepEqual(opts, [
    { value: 'CNY', symbol: '¥' },
    { value: 'USD', symbol: '$' },
    { value: 'KRW', symbol: '' },
  ])
  // 默认法币不受影响
  assert.equal(DEFAULT_FIAT, 'CNY')
  assert.ok(opts.some((o) => o.value === DEFAULT_FIAT))
})

test('fiatSymbol', () => {
  assert.equal(fiatSymbol('CNY'), '¥')
  assert.equal(fiatSymbol('JPY'), '¥')
  assert.equal(fiatSymbol('USD'), '$')
  assert.equal(fiatSymbol('KRW'), '')
})

test('formatKpiAmount', () => {
  assert.equal(formatKpiAmount('123.4'), '123.40')
  assert.equal(formatKpiAmount(0), '0.00')
  assert.equal(formatKpiAmount('abc'), '0.00')
  assert.equal(formatKpiAmount(null), '0.00')
  assert.equal(formatKpiAmount(undefined), '0.00')
  assert.equal(formatKpiAmount('1234.567'), '1234.57')
})

test('successRatePercent', () => {
  assert.equal(successRatePercent('88.888'), '88.89%')
  assert.equal(successRatePercent(100), '100.00%')
  assert.equal(successRatePercent(0), '0.00%')
  assert.equal(successRatePercent('bad'), '0.00%')
  assert.equal(successRatePercent(null), '0.00%')
})

test('customRangeToFromTo 两端齐全才有效', () => {
  assert.equal(customRangeToFromTo('', '2025-01-02'), null)
  assert.equal(customRangeToFromTo('2025-01-01', ''), null)
  assert.equal(customRangeToFromTo('bad', '2025-01-02'), null)
  assert.equal(customRangeToFromTo('2025-01-05', '2025-01-02'), null)
  assert.deepEqual(customRangeToFromTo('2025-01-01', '2025-01-02'), {
    from: '2025-01-01',
    to: '2025-01-02',
  })
  // 同一天有效
  assert.deepEqual(customRangeToFromTo('2025-01-01', '2025-01-01'), {
    from: '2025-01-01',
    to: '2025-01-01',
  })
})

test('formatPeriodLabel 对齐旧版 MM/DD - MM/DD', () => {
  assert.equal(formatPeriodLabel('2025-01-02T00:00:00+08:00', '2025-01-08T00:00:00+08:00'), '01/02 - 01/08')
  assert.equal(formatPeriodLabel(undefined, 'x'), '--')
  assert.equal(formatPeriodLabel('', ''), '--')
})

test('tokenShareRows 占比计算与排序', () => {
  const rows = tokenShareRows({ USDT: 3, TRX: 1 })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'USDT')
  assert.equal(rows[0].percent, 75)
  assert.equal(rows[1].percent, 25)
  const sum = rows.reduce((s, r) => s + r.percent, 0)
  assert.equal(sum, 100)
})

test('tokenShareRows 空值/非法值', () => {
  assert.deepEqual(tokenShareRows(undefined), [])
  assert.deepEqual(tokenShareRows(null), [])
  assert.deepEqual(tokenShareRows({}), [])
  assert.deepEqual(tokenShareRows({ USDT: 0, TRX: -1 }), [])
  assert.deepEqual(tokenShareRows({ USDT: Number.NaN }), [])
})

test('tokenShareRows 三项四舍五入误差吸收后总和仍为 100', () => {
  const rows = tokenShareRows({ A: 1, B: 1, C: 1 })
  const sum = rows.reduce((s, r) => s + r.percent, 0)
  assert.equal(sum, 100)
})

test('todayDateString', () => {
  assert.equal(todayDateString(new Date(2025, 0, 2)), '2025-01-02')
  assert.equal(todayDateString(new Date(2025, 11, 31)), '2025-12-31')
})
