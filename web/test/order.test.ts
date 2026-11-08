import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORDER_STATUS,
  ORDER_STATUS_OPTIONS,
  orderStatusKey,
  orderStatusVariant,
  canManualPaid,
  canCancel,
  canManualNotify,
  notifyStateKey,
  notifyDetailKey,
  getCurrencySymbol,
  cryptoBadgeVariant,
  getMerchantWebsite,
  toBackendDateTime,
  buildOrderListReq,
} from '../src/lib/order.ts'

test('ORDER_STATUS 枚举与 app/model/order.go 一致', () => {
  assert.equal(ORDER_STATUS.WAITING, 1)
  assert.equal(ORDER_STATUS.SUCCESS, 2)
  assert.equal(ORDER_STATUS.EXPIRED, 3)
  assert.equal(ORDER_STATUS.CANCELED, 4)
  assert.equal(ORDER_STATUS.CONFIRMING, 5)
  assert.equal(ORDER_STATUS.FAILED, 6)
  assert.deepEqual(ORDER_STATUS_OPTIONS, [1, 2, 3, 4, 5, 6])
})

test('orderStatusKey 状态文案键', () => {
  assert.equal(orderStatusKey(1), 'order.status-1')
  assert.equal(orderStatusKey(2), 'order.status-2')
  assert.equal(orderStatusKey(3), 'order.status-3')
  assert.equal(orderStatusKey(4), 'order.status-4')
  assert.equal(orderStatusKey(5), 'order.status-5')
  assert.equal(orderStatusKey(6), 'order.status-6')
  assert.equal(orderStatusKey(0), 'order.status-unknown')
  assert.equal(orderStatusKey(99), 'order.status-unknown')
})

test('orderStatusVariant 状态配色映射', () => {
  assert.equal(orderStatusVariant(1), 'secondary')
  assert.equal(orderStatusVariant(2), 'success')
  assert.equal(orderStatusVariant(3), 'outline')
  assert.equal(orderStatusVariant(4), 'warning')
  assert.equal(orderStatusVariant(5), 'default')
  assert.equal(orderStatusVariant(6), 'destructive')
  assert.equal(orderStatusVariant(42), 'outline')
})

test('canManualPaid：交易成功/已取消不可补单', () => {
  assert.equal(canManualPaid(1), true)
  assert.equal(canManualPaid(2), false)
  assert.equal(canManualPaid(3), true)
  assert.equal(canManualPaid(4), false)
  assert.equal(canManualPaid(5), true)
  assert.equal(canManualPaid(6), true)
})

test('canCancel：仅等待支付可取消', () => {
  assert.equal(canCancel(1), true)
  assert.equal(canCancel(2), false)
  assert.equal(canCancel(4), false)
  assert.equal(canCancel(5), false)
})

test('canManualNotify：交易成功且回调未成功', () => {
  assert.equal(canManualNotify(2, 0), true)
  assert.equal(canManualNotify(2, 2), true) // 多次失败仍在重试
  assert.equal(canManualNotify(2, 1), false)
  assert.equal(canManualNotify(1, 0), false)
  assert.equal(canManualNotify(5, 0), false)
})

test('notifyStateKey：仅交易成功时展示回调状态', () => {
  assert.equal(notifyStateKey(2, 1), 'order.notify-success')
  assert.equal(notifyStateKey(2, 0), 'order.notify-failed')
  assert.equal(notifyStateKey(1, 1), null)
  assert.equal(notifyStateKey(5, 0), null)
})

test('notifyDetailKey：详情页回调文案', () => {
  assert.equal(notifyDetailKey(1), 'order.notify-success')
  assert.equal(notifyDetailKey(0), 'order.notify-waiting-retry')
})

test('getCurrencySymbol 法币符号', () => {
  assert.equal(getCurrencySymbol('CNY'), '¥')
  assert.equal(getCurrencySymbol('USD'), '$')
  assert.equal(getCurrencySymbol('JPY'), '¥')
  assert.equal(getCurrencySymbol('GBP'), '£')
  assert.equal(getCurrencySymbol('EUR'), '€')
  assert.equal(getCurrencySymbol('KRW'), '')
})

test('cryptoBadgeVariant 加密货币配色', () => {
  assert.equal(cryptoBadgeVariant('USDT'), 'success')
  assert.equal(cryptoBadgeVariant('USDC'), 'secondary')
  assert.equal(cryptoBadgeVariant('TRX'), 'destructive')
  assert.equal(cryptoBadgeVariant('ETH'), 'default')
  assert.equal(cryptoBadgeVariant('BNB'), 'warning')
  assert.equal(cryptoBadgeVariant('GRAM'), 'default')
  assert.equal(cryptoBadgeVariant('XXX'), 'secondary')
})

test('getMerchantWebsite 取 return_url 的协议+主机', () => {
  assert.equal(
    getMerchantWebsite('https://shop.example.com/pay/return?x=1'),
    'https://shop.example.com/',
  )
  assert.equal(getMerchantWebsite('http://a.b.c'), 'http://a.b.c/')
  // 无效 URL 原样返回
  assert.equal(getMerchantWebsite('not-a-url'), 'not-a-url')
  assert.equal(getMerchantWebsite(''), '')
})

test('toBackendDateTime datetime-local 转后端格式', () => {
  assert.equal(toBackendDateTime('2025-01-02T15:04'), '2025-01-02 15:04:00')
  assert.equal(toBackendDateTime('2025-01-02T15:04:33'), '2025-01-02 15:04:33')
  assert.equal(toBackendDateTime(' 2025-01-02T08:00 '), '2025-01-02 08:00:00')
  assert.equal(toBackendDateTime(''), '')
  // 非控件格式原样返回
  assert.equal(toBackendDateTime('2025-01-02 15:04:00'), '2025-01-02 15:04:00')
})

test('buildOrderListReq：空值剔除 + 时间格式转换', () => {
  const req = buildOrderListReq(2, 20, 'desc', {
    order_id: ' 1001 ',
    trade_id: '',
    trade_type: 'usdt.trc20',
    address: '',
    status: 1,
    start_at: '2025-01-01T00:00',
    end_at: '2025-01-31T23:59:59',
  })
  assert.deepEqual(req, {
    page: 2,
    size: 20,
    sort: 'desc',
    keyword: '',
    order_id: '1001',
    trade_type: 'usdt.trc20',
    status: 1,
    start_at: '2025-01-01 00:00:00',
    end_at: '2025-01-31 23:59:59',
  })

  // 全空筛选：只保留基础字段
  const empty = buildOrderListReq(1, 10, 'desc', {
    order_id: '',
    trade_id: '',
    trade_type: '',
    address: '',
    status: 0,
    start_at: '',
    end_at: '',
  })
  assert.deepEqual(empty, { page: 1, size: 10, sort: 'desc', keyword: '' })
})
