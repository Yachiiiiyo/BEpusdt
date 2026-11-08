import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateOrderId,
  timeoutHoursToSeconds,
  joinCurrencies,
  buildCreateOrderReq,
} from '../src/lib/create-order.ts'

test('generateOrderId 前缀 PAY + 14 位本地时间', () => {
  const id = generateOrderId(new Date(2025, 0, 2, 3, 4, 5))
  assert.equal(id, 'PAY20250102030405')
})

test('generateOrderId 补零', () => {
  const id = generateOrderId(new Date(2024, 10, 1, 9, 8, 7))
  assert.equal(id, 'PAY20241101090807')
})

test('timeoutHoursToSeconds 小时转秒', () => {
  assert.equal(timeoutHoursToSeconds(1), 3600)
  assert.equal(timeoutHoursToSeconds(3), 10800)
})

test('joinCurrencies 逗号分隔并过滤空项', () => {
  assert.equal(joinCurrencies(['USDT', 'TRX']), 'USDT,TRX')
  assert.equal(joinCurrencies(['USDT', '']), 'USDT')
  assert.equal(joinCurrencies([]), '')
})

test('buildCreateOrderReq 请求体字段对齐 createReq', () => {
  const req = buildCreateOrderReq({
    name: '测试收款',
    order_id: 'PAY20250102030405',
    amount: 100,
    fiat: 'CNY',
    crypto: ['USDT', 'TRX'],
    timeoutHours: 2,
  })
  assert.deepEqual(req, {
    amount: 100,
    order_id: 'PAY20250102030405',
    name: '测试收款',
    fiat: 'CNY',
    currencies: 'USDT,TRX',
    timeout: 7200,
  })
})
