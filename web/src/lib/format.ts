/**
 * 格式化纯函数（不依赖浏览器环境之外的 API，便于单元测试）
 */

/** 秒级/毫秒级时间戳 → 本地时间字符串，如 2025-01-02 15:04:05 */
export function formatTimestamp(
  ts: number | string | null | undefined,
): string {
  if (ts === null || ts === undefined || ts === '') return ''
  let n = typeof ts === 'string' ? Number(ts) : ts
  if (!Number.isFinite(n)) return ''
  // 兼容秒级时间戳
  if (n < 1e12) n *= 1000
  const d = new Date(n)
  const pad = (v: number) => String(v).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** ISO/日期字符串 → 本地时间字符串（无效时原样返回） */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return formatTimestamp(d.getTime())
}

/** 数字/字符串 → 固定小数位字符串（默认 2 位），无效输入返回空串 */
export function formatDecimal(
  value: number | string | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(digits)
}

/** 千分位 + 固定小数位，如 12345.67 */
export function formatNumber(
  value: number | string | null | undefined,
  digits = 2,
): string {
  const s = formatDecimal(value, digits)
  if (!s) return ''
  const [int, frac] = s.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac === undefined ? grouped : `${grouped}.${frac}`
}

/** 截断长地址/哈希，如 T9yD22At...fCe4abcd；短于阈值时原样返回 */
export function truncateAddress(
  address: string | null | undefined,
  head = 8,
  tail = 4,
): string {
  if (!address) return ''
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}
