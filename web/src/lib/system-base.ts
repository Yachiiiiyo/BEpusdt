/**
 * 基本设置页的纯逻辑（规范化 / 校验），与旧版 Vue 后台（05da72e）web/src/views/system/base/components/*.vue 对齐。
 */

/** 逗号分隔的配置值 -> 去空白后的数组（mqtt_networks、payment_network_sort 等） */
export function splitCsv(value: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 前台网络排序规范化（api.vue normalizeNetworkOrder）：
 * 仅保留有效网络、去重，再补齐缺失的网络（按字母序）。
 */
export function normalizeNetworkOrder(value: string, validNetworks: string[]): string[] {
  const sorted = [...validNetworks].sort()
  const validSet = new Set(sorted)
  const seen = new Set<string>()
  const result: string[] = []

  for (const network of splitCsv(value)) {
    if (!validSet.has(network) || seen.has(network)) continue
    seen.add(network)
    result.push(network)
  }
  for (const network of sorted) {
    if (!seen.has(network)) result.push(network)
  }
  return result
}

/**
 * 收银台模板规范化（api.vue normalizePaymentCheckout）：
 * 当前值无效时优先回退 official，否则取第一个可用模板；无可用模板时原样返回。
 */
export function normalizePaymentCheckout(value: string, validValues: string[]): string {
  const raw = value || ''
  if (validValues.length === 0) return raw
  if (validValues.includes(raw)) return raw
  if (validValues.includes('official')) return 'official'
  return validValues[0] ?? ''
}

/** notifier_params 配置值（JSON 字符串或对象）-> 字符串键值对；解析失败返回 {} */
export function parseNotifierParams(raw: unknown): Record<string, string> {
  if (raw === null || raw === undefined) return {}
  let params: unknown = raw
  if (typeof raw === 'string') {
    if (raw.trim() === '') return {}
    try {
      params = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === null || value === undefined) continue
    result[key] = String(value)
  }
  return result
}

/** 只保留当前渠道的字段（notifier.vue filteredParams） */
export function filterNotifierParams(
  params: Record<string, string>,
  keys: string[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of keys) {
    const value = params[key]
    if (value !== undefined) result[key] = String(value)
  }
  return result
}

/** mqtt_topic_prefix 校验（mqtt.vue rules）；空串放行（保存时回退默认值 bepusdt） */
export type TopicPrefixErrorCode = '' | 'charset' | 'edge' | 'double'

export function validateTopicPrefix(value: string): TopicPrefixErrorCode {
  if (!value) return ''
  if (!/^[a-zA-Z0-9_/]+$/.test(value)) return 'charset'
  if (value.startsWith('/') || value.endsWith('/')) return 'edge'
  if (value.includes('//')) return 'double'
  return ''
}

/** info.vue 数字校验：正数（允许小数） */
export function isPositiveNumber(value: string): boolean {
  const num = Number(value)
  return value !== '' && Number.isFinite(num) && num > 0
}

/** info.vue payment_lookback_hour 校验：正整数 */
export function isPositiveInteger(value: string): boolean {
  const num = Number(value)
  return value !== '' && Number.isInteger(num) && num > 0
}

/** info.vue payment_timeout 校验：180-3600 */
export function isTimeoutInRange(value: string): boolean {
  const num = Number(value)
  return value !== '' && Number.isFinite(num) && num >= 180 && num <= 3600
}
