import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  filterNotifierParams,
  isPositiveInteger,
  isPositiveNumber,
  isTimeoutInRange,
  normalizeNetworkOrder,
  normalizePaymentCheckout,
  parseNotifierParams,
  splitCsv,
  validateTopicPrefix,
} from '../src/lib/system-base.ts'

test('splitCsv: 逗号分隔值去空白、去空项', () => {
  assert.deepEqual(splitCsv(''), [])
  assert.deepEqual(splitCsv('tron, bsc,,polygon,'), ['tron', 'bsc', 'polygon'])
})

test('normalizeNetworkOrder: 去重、剔除无效网络并按字母序补齐', () => {
  const valid = ['tron', 'bsc', 'solana']
  assert.deepEqual(normalizeNetworkOrder('solana,tron,solana,fake', valid), [
    'solana',
    'tron',
    'bsc',
  ])
  assert.deepEqual(normalizeNetworkOrder('', valid), ['bsc', 'solana', 'tron'])
  assert.deepEqual(normalizeNetworkOrder('anything', []), [])
})

test('normalizePaymentCheckout: 无效值回退 official 或第一个模板', () => {
  const values = ['alpha', 'official', 'beta']
  assert.equal(normalizePaymentCheckout('official', values), 'official')
  assert.equal(normalizePaymentCheckout('alpha', values), 'alpha')
  assert.equal(normalizePaymentCheckout('gone', values), 'official')
  assert.equal(normalizePaymentCheckout('', ['beta', 'alpha']), 'beta')
  // 无可用模板时原样返回
  assert.equal(normalizePaymentCheckout('raw', []), 'raw')
})

test('parseNotifierParams: 后端 notifier_params 是 JSON 字符串', () => {
  assert.deepEqual(
    parseNotifierParams('{"bot_token":"t","chat_id":123}'),
    { bot_token: 't', chat_id: '123' },
  )
})

test('parseNotifierParams: 兼容对象 / 空 / 非法输入', () => {
  assert.deepEqual(parseNotifierParams({ a: '1', b: 2 }), { a: '1', b: '2' })
  assert.deepEqual(parseNotifierParams(''), {})
  assert.deepEqual(parseNotifierParams(null), {})
  assert.deepEqual(parseNotifierParams(undefined), {})
  assert.deepEqual(parseNotifierParams('not json'), {})
  assert.deepEqual(parseNotifierParams('[1,2]'), {})
  assert.deepEqual(parseNotifierParams({ a: null }), {})
})

test('filterNotifierParams: 只保留当前渠道字段', () => {
  assert.deepEqual(
    filterNotifierParams({ bot_token: 't', device_key: 'd', chat_id: 'c' }, [
      'bot_token',
      'chat_id',
    ]),
    { bot_token: 't', chat_id: 'c' },
  )
})

test('validateTopicPrefix: 规则与旧版 mqtt.vue 一致', () => {
  assert.equal(validateTopicPrefix(''), '')
  assert.equal(validateTopicPrefix('bepusdt'), '')
  assert.equal(validateTopicPrefix('a/b_c1'), '')
  assert.equal(validateTopicPrefix('a-b'), 'charset')
  assert.equal(validateTopicPrefix('汉'), 'charset')
  assert.equal(validateTopicPrefix('/abc'), 'edge')
  assert.equal(validateTopicPrefix('abc/'), 'edge')
  assert.equal(validateTopicPrefix('a//b'), 'double')
})

test('数字校验：正数 / 正整数 / 超时范围', () => {
  assert.equal(isPositiveNumber('0.01'), true)
  assert.equal(isPositiveNumber('0'), false)
  assert.equal(isPositiveNumber('-1'), false)
  assert.equal(isPositiveNumber(''), false)
  assert.equal(isPositiveNumber('abc'), false)

  assert.equal(isPositiveInteger('2'), true)
  assert.equal(isPositiveInteger('2.5'), false)
  assert.equal(isPositiveInteger('0'), false)
  assert.equal(isPositiveInteger(''), false)

  assert.equal(isTimeoutInRange('180'), true)
  assert.equal(isTimeoutInRange('3600'), true)
  assert.equal(isTimeoutInRange('1200'), true)
  assert.equal(isTimeoutInRange('179'), false)
  assert.equal(isTimeoutInRange('3601'), false)
  assert.equal(isTimeoutInRange(''), false)
})
