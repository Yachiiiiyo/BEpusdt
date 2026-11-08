/**
 * 首页看板纯函数（不依赖浏览器/DOM 之外的 API，便于单元测试）
 */

export interface FiatOption {
  value: string
  symbol: string
}

/** 法币选项（对齐旧版 home.vue 的 fiatOptions），默认 CNY */
export const FIAT_OPTIONS: FiatOption[] = [
  { value: 'CNY', symbol: '¥' },
  { value: 'USD', symbol: '$' },
  { value: 'EUR', symbol: '€' },
  { value: 'GBP', symbol: '£' },
  { value: 'JPY', symbol: '¥' },
]

export const DEFAULT_FIAT = 'CNY'

/**
 * 根据后端 trade_fiat 列表过滤/补充法币选项：
 * 只保留后端支持的法币；若后端支持但不在内置列表中，追加（符号缺省为货币代码本身）。
 * 内置顺序优先，默认仍是 CNY。
 */
export function resolveFiatOptions(tradeFiats: string[] | undefined | null): FiatOption[] {
  if (!Array.isArray(tradeFiats) || tradeFiats.length === 0) return FIAT_OPTIONS
  const kept = FIAT_OPTIONS.filter((o) => tradeFiats.includes(o.value))
  const extra = tradeFiats
    .filter((v) => !FIAT_OPTIONS.some((o) => o.value === v))
    .map((v) => ({ value: v, symbol: '' }))
  return [...kept, ...extra]
}

export function fiatSymbol(fiat: string): string {
  return FIAT_OPTIONS.find((o) => o.value === fiat)?.symbol ?? ''
}

/** KPI 金额/比率格式化：固定两位小数，无效输入返回 '0.00' */
export function formatKpiAmount(value: number | string | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

/** 成功率百分比：后端 order_success_rate 是 0-100 的字符串/数字 */
export function successRatePercent(value: number | string | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '0.00%'
  return `${n.toFixed(2)}%`
}

/**
 * 自定义日期范围（YYYY-MM-DD）→ 请求 from/to。
 * 两端都填写才返回；from 晚于 to 时视为无效（返回 null）。
 * 返回的字符串与旧版一致：直接传 YYYY-MM-DD（后端支持该格式）。
 */
export function customRangeToFromTo(
  from: string,
  to: string,
): { from: string; to: string } | null {
  const f = (from ?? '').trim()
  const t = (to ?? '').trim()
  if (!f || !t) return null
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRe.test(f) || !dateRe.test(t)) return null
  if (f > t) return null
  return { from: f, to: t }
}

/** 统计周期展示标签：RFC3339 → "MM/DD - MM/DD"，缺省 "--"（对齐旧版 formatPeriod） */
export function formatPeriodLabel(from?: string, to?: string): string {
  if (!from || !to) return '--'
  const slice = (s: string) => s.slice(5, 10).replace('-', '/')
  return `${slice(from)} - ${slice(to)}`
}

export interface TokenShareRow {
  name: string
  amount: number
  percent: number
}

/** token_map → 占比行（按金额降序，占比两位小数，总和 100 误差吸收到最大项） */
export function tokenShareRows(tokenMap: Record<string, number> | undefined | null): TokenShareRow[] {
  if (!tokenMap || typeof tokenMap !== 'object') return []
  const entries = Object.entries(tokenMap)
    .map(([name, value]) => {
      const n = Number(value)
      return { name, amount: Number.isFinite(n) ? n : 0 }
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const total = entries.reduce((sum, r) => sum + r.amount, 0)
  if (total <= 0) return []
  let percentSum = 0
  return entries.map((r, i) => {
    const isLast = i === entries.length - 1
    if (isLast) {
      // 最后一项吸收四舍五入误差，保证总和等于 100
      return { ...r, percent: Number((100 - percentSum).toFixed(2)) }
    }
    const percent = Number(((r.amount / total) * 100).toFixed(2))
    percentSum += percent
    return { ...r, percent }
  })
}

/** 当天日期字符串 YYYY-MM-DD（本地时区） */
export function todayDateString(d = new Date()): string {
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
