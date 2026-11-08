import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyForbidden } from '../src/api/errors.ts'

test('缺 session 的 403', () => {
  assert.equal(classifyForbidden('unauthorized access'), 'session')
})

test('token 相关的 403', () => {
  assert.equal(classifyForbidden('token expired, please login again'), 'token')
  assert.equal(classifyForbidden('missing authorization token'), 'token')
  assert.equal(classifyForbidden('Invalid Authorization Token'), 'token')
})

test('未知或空 msg', () => {
  assert.equal(classifyForbidden(''), 'unknown')
  assert.equal(classifyForbidden(undefined), 'unknown')
  assert.equal(classifyForbidden('something else'), 'unknown')
})
