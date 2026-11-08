/**
 * 汇率列表页纯逻辑（对齐旧版 Vue 后台（05da72e）web/src/views/rate/{list.ts,common.ts}
 * 与 app/handler/admin/rate.go 的 rateListReq）
 */

/** 法币旗帜 emoji（旧版 rate/common.ts getFiatFlag） */
const FIAT_FLAG_MAP: Record<string, string> = {
  CNY: '🇨🇳',
  USD: '🇺🇸',
  JPY: '🇯🇵',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
}

export function getFiatFlag(fiat: string): string {
  return FIAT_FLAG_MAP[fiat] ?? '🌍'
}

export interface RateFilterInput {
  fiat: string
  crypto: string
  /** datetime-local 原始值（YYYY-MM-DDTHH:mm） */
  start_at: string
  end_at: string
}

export interface RateListReqBuilt {
  page: number
  size: number
  sort: string
  keyword: string
  fiat?: string
  crypto?: string
  /** [start, end]，两者都有值时才携带（Go 端 len == 2 才生效） */
  datetime?: string[]
}

/** datetime-local 值 → 后端时间格式（YYYY-MM-DD HH:mm:ss），复用订单页规则 */
function toBackendDateTime(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return v
  const [date, time] = v.split('T')
  const parts = time.split(':')
  while (parts.length < 3) parts.push('00')
  return `${date} ${parts.join(':')}`
}

/** 组装 POST /api/rate/list 请求体 */
export function buildRateListReq(
  page: number,
  size: number,
  sort: string,
  f: RateFilterInput,
): RateListReqBuilt {
  const req: RateListReqBuilt = {
    page,
    size,
    sort,
    keyword: '',
  }
  if (f.fiat.trim()) req.fiat = f.fiat.trim()
  if (f.crypto.trim()) req.crypto = f.crypto.trim()
  const start = toBackendDateTime(f.start_at)
  const end = toBackendDateTime(f.end_at)
  if (start && end) req.datetime = [start, end]
  return req
}
