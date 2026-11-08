import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTimestamp,
  formatDateTime,
  formatDecimal,
  formatNumber,
  truncateAddress,
} from '../src/lib/format.ts'

test('formatTimestamp 秒级/毫秒级/字符串', () => {
  // 毫秒级（UTC 固定时区不受本地影响：直接构造本地时间）
  const d = new Date(2025, 0, 2, 15, 4, 5)
  assert.equal(formatTimestamp(d.getTime()), '2025-01-02 15:04:05')
  assert.equal(formatTimestamp(Math.floor(d.getTime() / 1000)), '2025-01-02 15:04:05')
  assert.equal(formatTimestamp(String(d.getTime())), '2025-01-02 15:04:05')
})

test('formatTimestamp 空值与无效值', () => {
  assert.equal(formatTimestamp(null), '')
  assert.equal(formatTimestamp(undefined), '')
  assert.equal(formatTimestamp(''), '')
  assert.equal(formatTimestamp('abc'), '')
})

test('formatDateTime ISO 字符串与无效字符串', () => {
  const d = new Date(2025, 0, 2, 8, 30, 0)
  assert.equal(formatDateTime(d.toISOString()), '2025-01-02 08:30:00')
  assert.equal(formatDateTime(''), '')
  assert.equal(formatDateTime(null), '')
  assert.equal(formatDateTime(undefined), '')
  assert.equal(formatDateTime('not-a-date'), 'not-a-date')
})

test('formatDecimal 数字与字符串，四舍五入', () => {
  assert.equal(formatDecimal(123.456), '123.46')
  assert.equal(formatDecimal('123.451'), '123.45')
  assert.equal(formatDecimal(123.4, 4), '123.4000')
  assert.equal(formatDecimal(null), '')
  assert.equal(formatDecimal('abc'), '')
})

test('formatNumber 千分位', () => {
  assert.equal(formatNumber(1234567.891), '1,234,567.89')
  assert.equal(formatNumber('1234567.891', 3), '1,234,567.891')
  assert.equal(formatNumber(999), '999.00')
  assert.equal(formatNumber(''), '')
})

test('truncateAddress 截断与短地址', () => {
  assert.equal(truncateAddress('T9yD22AtZCe4abcd1234'), 'T9yD22At…1234')
  assert.equal(truncateAddress('T9yD22AtZCe4a'), 'T9yD22AtZCe4a')
  assert.equal(truncateAddress(''), '')
  assert.equal(truncateAddress(null), '')
  assert.equal(truncateAddress(undefined), '')
  assert.equal(truncateAddress('T9yD22AtZCe4abcd1234', 4, 2), 'T9yD…34')
})
