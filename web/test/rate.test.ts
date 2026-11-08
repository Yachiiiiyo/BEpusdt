import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRateListReq, getFiatFlag } from '../src/lib/rate.ts'

test('getFiatFlag returns mapped flag', () => {
  assert.equal(getFiatFlag('CNY'), '🇨🇳')
  assert.equal(getFiatFlag('USD'), '🇺🇸')
  assert.equal(getFiatFlag('JPY'), '🇯🇵')
  assert.equal(getFiatFlag('EUR'), '🇪🇺')
  assert.equal(getFiatFlag('GBP'), '🇬🇧')
  assert.equal(getFiatFlag('XXX'), '🌍')
})

test('buildRateListReq keeps base fields', () => {
  assert.deepEqual(buildRateListReq(1, 10, 'desc', {
    fiat: '',
    crypto: '',
    start_at: '',
    end_at: '',
  }), { page: 1, size: 10, sort: 'desc', keyword: '' })
})

test('buildRateListReq carries fiat and crypto when set', () => {
  const req = buildRateListReq(2, 20, 'desc', {
    fiat: 'CNY',
    crypto: 'USDT',
    start_at: '',
    end_at: '',
  })
  assert.equal(req.fiat, 'CNY')
  assert.equal(req.crypto, 'USDT')
  assert.equal(req.datetime, undefined)
})

test('buildRateListReq only sends datetime when both ends present', () => {
  const both = buildRateListReq(1, 10, 'desc', {
    fiat: '',
    crypto: '',
    start_at: '2024-01-02T03:04',
    end_at: '2024-02-03T04:05',
  })
  assert.deepEqual(both.datetime, ['2024-01-02 03:04:00', '2024-02-03 04:05:00'])

  const onlyStart = buildRateListReq(1, 10, 'desc', {
    fiat: '',
    crypto: '',
    start_at: '2024-01-02T03:04',
    end_at: '',
  })
  assert.equal(onlyStart.datetime, undefined)
})
