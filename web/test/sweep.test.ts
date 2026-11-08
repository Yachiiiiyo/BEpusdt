import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SWEEP_STATES,
  sweepStateKey,
  sweepStateVariant,
  sweepStateFallback,
  canRetrySweep,
  formatSweepAmount,
  buildSweepListReq,
} from '../src/lib/sweep.ts'

test('SWEEP_STATES 覆盖旧版全部状态且值唯一', () => {
  assert.deepEqual(
    SWEEP_STATES.map((s) => s.value),
    [
      'pending',
      'funding',
      'funded',
      'sweeping',
      'swept',
      'done',
      'skipped',
      'failed',
    ],
  )
})

test('sweepStateKey / Variant / Fallback', () => {
  assert.equal(sweepStateKey('failed'), 'sweep.state-failed')
  assert.equal(sweepStateKey('swept'), 'sweep.state-swept')
  assert.equal(sweepStateKey('unknown'), null)
  assert.equal(sweepStateVariant('failed'), 'destructive')
  assert.equal(sweepStateVariant('sweeping'), 'warning')
  assert.equal(sweepStateVariant('done'), 'success')
  assert.equal(sweepStateVariant('nope'), 'outline')
  assert.equal(sweepStateFallback('failed'), '')
  assert.equal(sweepStateFallback('custom-x'), 'custom-x')
})

test('canRetrySweep 仅 failed 可重试', () => {
  assert.equal(canRetrySweep('failed'), true)
  assert.equal(canRetrySweep('pending'), false)
  assert.equal(canRetrySweep('done'), false)
  assert.equal(canRetrySweep(''), false)
})

test('formatSweepAmount 18 位小数最小单位转换', () => {
  assert.equal(formatSweepAmount('1000000000000000000'), '1')
  assert.equal(formatSweepAmount('1234500000000000000'), '1.2345')
  assert.equal(formatSweepAmount('0'), '0')
  assert.equal(formatSweepAmount('1'), '0.000000000000000001')
  assert.equal(formatSweepAmount('12345678901234567890123'), '12345.678901234567890123')
  // 前导零：001 + 18 个 0 = 1 USDT
  assert.equal(formatSweepAmount('001000000000000000000'), '1')
})

test('formatSweepAmount 空值/非法输入', () => {
  assert.equal(formatSweepAmount(''), '')
  assert.equal(formatSweepAmount(null), '')
  assert.equal(formatSweepAmount(undefined), '')
  // 非纯数字原样返回
  assert.equal(formatSweepAmount('abc'), 'abc')
  assert.equal(formatSweepAmount('12.5'), '12.5')
})

test('buildSweepListReq 组装请求体（含 trim）', () => {
  assert.deepEqual(
    buildSweepListReq(2, 20, 'desc', {
      state: 'failed',
      address: ' 0xabc ',
      order_id: ' ep2024 ',
    }),
    { page: 2, size: 20, sort: 'desc', state: 'failed', address: '0xabc', order_id: 'ep2024' },
  )
  assert.deepEqual(
    buildSweepListReq(1, 10, 'desc', { state: '', address: '', order_id: '' }),
    { page: 1, size: 10, sort: 'desc', state: '', address: '', order_id: '' },
  )
})
