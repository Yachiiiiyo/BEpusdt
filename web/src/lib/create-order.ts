/**
 * 手工建单纯函数（不依赖浏览器 API 之外的运行环境，便于单元测试）
 */

/** 生成商户订单号：PAY + 本地时间 YYYYMMDDHHmmss（对齐旧版 create-order.vue） */
export function generateOrderId(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const y = now.getFullYear()
  const m = p(now.getMonth() + 1)
  const d = p(now.getDate())
  const h = p(now.getHours())
  const mi = p(now.getMinutes())
  const s = p(now.getSeconds())
  return `PAY${y}${m}${d}${h}${mi}${s}`
}

/** 有效期（小时）转秒：后端 timeout 字段单位为秒 */
export function timeoutHoursToSeconds(hours: number): number {
  return Math.round(hours * 3600)
}

/** 选中的加密货币列表 → 后端 currencies 字段（逗号分隔，空数组返回空串） */
export function joinCurrencies(list: string[]): string {
  return list.filter((c) => c !== '').join(',')
}

/** 表单值 → POST /api/order/create 请求体（对齐 app/handler/admin/order.go createReq） */
export interface CreateOrderForm {
  name: string
  order_id: string
  amount: number
  fiat: string
  crypto: string[]
  timeoutHours: number
}

export function buildCreateOrderReq(form: CreateOrderForm): {
  amount: number
  order_id: string
  name: string
  fiat: string
  currencies: string
  timeout: number
} {
  return {
    amount: form.amount,
    order_id: form.order_id,
    name: form.name,
    fiat: form.fiat,
    currencies: joinCurrencies(form.crypto),
    timeout: timeoutHoursToSeconds(form.timeoutHours),
  }
}
