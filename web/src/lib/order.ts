/**
 * 订单纯函数/映射（不依赖 React / i18n / vite 别名，便于单元测试）
 *
 * 枚举与条件来源：
 * - app/model/order.go：OrderStatusWaiting=1 ... OrderStatusFailed=6
 * - app/handler/admin/order.go：Cancel 仅允许未支付订单；Paid 拒绝已取消订单；
 *   ManualNotify 仅允许交易成功订单
 * - 旧版 Vue 后台（05da72e）web/src/views/order/order.vue + components/detail.vue：按钮显示/禁用条件
 */

/** Badge 组件配色（与 components/ui/badge.tsx 的 variant 一致，保持纯 TS 可测试） */
export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline'

/** 订单状态枚举（app/model/order.go） */
export const ORDER_STATUS = {
  WAITING: 1,
  SUCCESS: 2,
  EXPIRED: 3,
  CANCELED: 4,
  CONFIRMING: 5,
  FAILED: 6,
} as const

export type OrderStatusValue =
  (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

/** 状态筛选下拉的全部选项值 */
export const ORDER_STATUS_OPTIONS: OrderStatusValue[] = [1, 2, 3, 4, 5, 6]

/** 状态 → i18n 键（order.status-<n> / order.status-unknown） */
export function orderStatusKey(status: number): string {
  switch (status) {
    case ORDER_STATUS.WAITING:
      return 'order.status-1'
    case ORDER_STATUS.SUCCESS:
      return 'order.status-2'
    case ORDER_STATUS.EXPIRED:
      return 'order.status-3'
    case ORDER_STATUS.CANCELED:
      return 'order.status-4'
    case ORDER_STATUS.CONFIRMING:
      return 'order.status-5'
    case ORDER_STATUS.FAILED:
      return 'order.status-6'
    default:
      return 'order.status-unknown'
  }
}

/** 状态 → 徽标配色（对齐旧版 statusMap 颜色语义） */
export function orderStatusVariant(status: number): BadgeVariant {
  switch (status) {
    case ORDER_STATUS.WAITING:
      return 'secondary' // 蓝
    case ORDER_STATUS.SUCCESS:
      return 'success' // 绿
    case ORDER_STATUS.EXPIRED:
      return 'outline' // 灰
    case ORDER_STATUS.CANCELED:
      return 'warning' // 金
    case ORDER_STATUS.CONFIRMING:
      return 'default' // 紫
    case ORDER_STATUS.FAILED:
      return 'destructive' // 红
    default:
      return 'outline'
  }
}

/**
 * 是否允许补单（手动标记已支付）。
 * 旧版 order.vue：status !== 2 && status !== 4（交易成功/已取消不可补单）
 */
export function canManualPaid(status: number): boolean {
  return status !== ORDER_STATUS.SUCCESS && status !== ORDER_STATUS.CANCELED
}

/** 是否允许取消订单：后端仅允许取消未支付订单（status === 1） */
export function canCancel(status: number): boolean {
  return status === ORDER_STATUS.WAITING
}

/**
 * 是否允许手动回调。
 * 旧版 detail.vue：status === 2 && notify_state === 0（交易成功且回调未成功）
 */
export function canManualNotify(status: number, notifyState: number): boolean {
  return status === ORDER_STATUS.SUCCESS && notifyState !== 1
}

/**
 * 回调状态列的 i18n 键；仅在 status === 2 时展示，否则返回 null（显示 -）
 * 旧版表格：status === 2 ? (notify_state === 1 ? 成功 : 失败) : '-'
 */
export function notifyStateKey(
  status: number,
  notifyState: number,
): string | null {
  if (status !== ORDER_STATUS.SUCCESS) return null
  return notifyState === 1
    ? 'order.notify-success'
    : 'order.notify-failed'
}

/** 详情回调状态文案（失败时带重试次数，旧版 detail.vue） */
export function notifyDetailKey(notifyState: number): string {
  return notifyState === 1
    ? 'order.notify-success'
    : 'order.notify-waiting-retry'
}

/** 法币符号（旧版 detail.vue currencySymbolMap） */
export function getCurrencySymbol(fiat: string): string {
  const map: Record<string, string> = {
    CNY: '¥',
    USD: '$',
    JPY: '¥',
    GBP: '£',
    EUR: '€',
  }
  return map[fiat] ?? ''
}

/** 加密货币标签配色（旧版 rate/common.ts getCryptoColor 的语义映射） */
export function cryptoBadgeVariant(crypto: string): BadgeVariant {
  switch (crypto) {
    case 'USDT':
      return 'success' // green
    case 'USDC':
      return 'secondary' // blue
    case 'TRX':
      return 'destructive' // red
    case 'ETH':
      return 'default' // purple
    case 'BNB':
      return 'warning' // orange
    case 'GRAM':
      return 'default' // #0088CC
    default:
      return 'secondary' // gray
  }
}

/** 商户网站（return_url 的协议+主机，旧版 detail.vue getMerchantWebsite） */
export function getMerchantWebsite(returnUrl: string): string {
  if (!returnUrl) return ''
  try {
    const url = new URL(returnUrl)
    return `${url.protocol}//${url.host}/`
  } catch {
    return returnUrl
  }
}

/**
 * datetime-local 控件值 → 后端 start_at/end_at 格式（YYYY-MM-DD HH:mm:ss）。
 * "2025-01-02T15:04" → "2025-01-02 15:04:00"；已带秒则只替换 T。
 */
export function toBackendDateTime(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return v
  const [date, time] = v.split('T')
  const parts = time.split(':')
  while (parts.length < 3) parts.push('00')
  return `${date} ${parts.join(':')}`
}

/** 构造订单列表请求（空值剔除，status 为 0 表示全部） */
export interface OrderFilterInput {
  order_id: string
  trade_id: string
  trade_type: string
  address: string
  /** 0 表示全部 */
  status: number
  start_at: string
  end_at: string
}

/** 订单列表请求（与 api/order.ts OrderListReq 结构一致，保持纯 TS 可测试） */
export interface OrderListReqBuilt {
  page: number
  size: number
  sort: string
  keyword: string
  order_id?: string
  trade_id?: string
  trade_type?: string
  status?: number
  address?: string
  start_at?: string
  end_at?: string
}

export function buildOrderListReq(
  page: number,
  size: number,
  sort: string,
  f: OrderFilterInput,
): OrderListReqBuilt {
  const req: OrderListReqBuilt = {
    page,
    size,
    sort,
    keyword: '',
  }
  if (f.order_id.trim()) req.order_id = f.order_id.trim()
  if (f.trade_id.trim()) req.trade_id = f.trade_id.trim()
  if (f.address.trim()) req.address = f.address.trim()
  if (f.trade_type) req.trade_type = f.trade_type
  if (f.status > 0) req.status = f.status
  if (f.start_at) req.start_at = toBackendDateTime(f.start_at)
  if (f.end_at) req.end_at = toBackendDateTime(f.end_at)
  return req
}
