/**
 * /api/auth/info 里交易元数据的规范化（纯函数）。
 *
 * 后端真实形状（app/model/registry.go、app/handler/auth/auth.go Info）：
 * - trade_type:    { "usdt.trc20": "USDT-TRC20", ... }  交易类型 -> 别名
 * - trade_network: { "tron": "TRON", ... }              网络 -> 网络名
 * - trade_fiat:    { "CNY": {}, "USD": {}, ... }        法币代码为键（值是空结构体）
 * - trade_crypto:  { "USDT": "tether", ... }            币种代码为键（值是 CoinId）
 * 旧版 Vue 页面一律用 Object.entries / for key in 遍历。这里兼容数组或 null，保证页面永远拿到数组。
 */

export interface MetaOption {
  value: string
  label: string
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 对象 -> 按键排序的 {value,label}；label 取字符串值，否则取键本身。数组按元素本身处理。 */
export function toOptions(input: unknown): MetaOption[] {
  if (Array.isArray(input)) {
    return input
      .filter((x): x is string => typeof x === 'string' && x !== '')
      .map((x) => ({ value: x, label: x }))
  }
  if (!isPlainObject(input)) return []
  return Object.keys(input)
    .sort()
    .map((key) => {
      const v = input[key]
      return { value: key, label: typeof v === 'string' && v !== '' ? v : key }
    })
}

/** 对象的键（或数组元素）-> 排序后的字符串数组 */
export function toKeys(input: unknown): string[] {
  return toOptions(input).map((o) => o.value)
}

/** 列表接口的 data 兜底：Go 空切片可能序列化为 null，或在 omitempty 下整个字段缺失 */
export function asArray<T>(input: unknown): T[] {
  return Array.isArray(input) ? (input as T[]) : []
}
