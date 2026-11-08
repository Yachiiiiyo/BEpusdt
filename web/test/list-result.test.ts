import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toListResult } from '../src/api/list-result.ts'

test('列表响应提取 data 与 total', () => {
  assert.deepEqual(
    toListResult({ code: 200, data: [{ id: 1 }], total: 42 }),
    { data: [{ id: 1 }], total: 42 },
  )
})

test('total 缺省时为 0', () => {
  assert.deepEqual(
    toListResult({ code: 200, data: [] }),
    { data: [], total: 0 },
  )
})

test('total 为 0 时保持 0 而非回退', () => {
  assert.deepEqual(
    toListResult({ code: 200, data: [], total: 0 }),
    { data: [], total: 0 },
  )
})
