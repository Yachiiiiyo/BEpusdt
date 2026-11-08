import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isPasswordChange,
  validateNewPassword,
  validateSecure,
} from '../src/lib/security.ts'

test('validateSecure: 空串放行（表示不修改）', () => {
  assert.equal(validateSecure(''), '')
})

test('validateSecure: 必须以 / 开头（对应后端 securePath 前缀校验）', () => {
  assert.equal(validateSecure('admin1234'), 'prefix')
  assert.equal(validateSecure('admin/path'), 'prefix')
})

test('validateSecure: 长度 8-18', () => {
  assert.equal(validateSecure('/'), 'length')
  assert.equal(validateSecure('/short'), 'length') // 6
  assert.equal(validateSecure('/1234567'), '') // 8
  assert.equal(validateSecure('/12345678901234567'), '') // 18
  assert.equal(validateSecure('/123456789012345678'), 'length') // 19
})

test('validateSecure: 仅字母数字（^/[a-zA-Z0-9]+$）', () => {
  assert.equal(validateSecure('/admin_sec'), 'charset')
  // 9 个字符但含非 ASCII，长度先通过，落到字符集校验（与后端判断顺序一致）
  assert.equal(validateSecure('/管理员管理员管理员'), 'charset')
  assert.equal(validateSecure('/admin-123'), 'charset')
  assert.equal(validateSecure('/Admin123'), '')
})

test('validateNewPassword: 不修改时放行', () => {
  assert.equal(validateNewPassword('', '', false), '')
})

test('validateNewPassword: 两次不一致', () => {
  assert.equal(validateNewPassword('abc123', 'abc124', true), 'mismatch')
  assert.equal(validateNewPassword('abc123', '', true), 'mismatch')
})

test('validateNewPassword: 最少 6 位', () => {
  assert.equal(validateNewPassword('abc12', 'abc12', true), 'min')
  assert.equal(validateNewPassword('abc123', 'abc123', true), '')
})

test('validateNewPassword: 最多 72 字节（bcrypt 限制，多字节字符算多字节）', () => {
  // 73 个 ASCII
  assert.equal(validateNewPassword('a'.repeat(73), 'a'.repeat(73), true), 'max')
  assert.equal(validateNewPassword('a'.repeat(72), 'a'.repeat(72), true), '')
  // 25 个汉字 = 75 字节 > 72
  const cjk = '汉'.repeat(25)
  assert.equal(validateNewPassword(cjk, cjk, true), 'max')
  // 24 个汉字 = 72 字节
  const cjkOk = '汉'.repeat(24)
  assert.equal(validateNewPassword(cjkOk, cjkOk, true), '')
})

test('isPasswordChange: 与后端 changePassword 判断一致', () => {
  assert.equal(isPasswordChange('', ''), false)
  assert.equal(isPasswordChange('abc', ''), true)
  assert.equal(isPasswordChange('', 'abc'), true)
  assert.equal(isPasswordChange('abc', 'abc'), true)
})
