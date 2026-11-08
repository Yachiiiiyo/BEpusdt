import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totalPages, pageWindow } from '../src/lib/pagination.ts'

test('totalPages 正常/非法输入', () => {
  assert.equal(totalPages(100, 10), 10)
  assert.equal(totalPages(101, 10), 11)
  assert.equal(totalPages(0, 10), 1)
  assert.equal(totalPages(10, 0), 0)
  assert.equal(totalPages(10, -1), 0)
})

test('pageWindow 单页', () => {
  assert.deepEqual(pageWindow(1, 1), [1])
})

test('pageWindow 少页数不带省略号', () => {
  assert.deepEqual(pageWindow(2, 4), [1, 2, 3, 4])
})

test('pageWindow 大页数带省略号', () => {
  assert.deepEqual(pageWindow(5, 20), [1, '…', 4, 5, 6, '…', 20])
  assert.deepEqual(pageWindow(1, 20), [1, 2, '…', 20])
  assert.deepEqual(pageWindow(20, 20), [1, '…', 19, 20])
})

test('pageWindow 边界 clamp', () => {
  assert.deepEqual(pageWindow(0, 5), [1, '…', 5])
  assert.deepEqual(pageWindow(6, 5), [1, '…', 5])
  assert.deepEqual(pageWindow(1, 0), [])
})
