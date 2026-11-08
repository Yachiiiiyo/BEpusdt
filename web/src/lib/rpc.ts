/**
 * 区块节点页纯逻辑，与旧版 Vue 后台（05da72e）web/src/views/system/rpc/rpc.vue 对齐。
 * 配置键与 app/handler/admin/conf.go Rpc() / app/model/const.go 一一对应。
 */

/** conf.GetStats() 里单个网络的统计（app/conf/stat.go info） */
export interface RpcStat {
  block: string
  succ: string
  time: number
}

/** 表单里的网络字段（顺序与旧版 networks 一致） */
export interface RpcFieldDef {
  /** 配置键（model.ConfKey） */
  key: string
  /** 字段 label i18n key（systemRpc.label-*） */
  labelKey: string
}

/** 状态总览的网络（顺序与旧版 allNetworks 一致） */
export interface StatNetworkDef {
  /** 配置键 */
  key: string
  /** stats 里的网络名 */
  statKey: string
  /** 总览卡片名称 i18n key（systemRpc.net-*） */
  netKey: string
  /** 网络品牌色（沿用旧版 allNetworks color） */
  color: string
}

/** Tron Grid Api Key 的配置键 */
export const TRON_GRID_API_KEY = 'rpc_endpoint_tron_grid_api_key'

/** 表单字段：11 个 RPC/配置地址（旧版 networks 数组，顺序一致） */
export const RPC_FIELDS: RpcFieldDef[] = [
  { key: 'rpc_endpoint_ethereum', labelKey: 'systemRpc.label-ethereum' },
  { key: 'rpc_endpoint_bsc', labelKey: 'systemRpc.label-bsc' },
  { key: 'rpc_endpoint_polygon', labelKey: 'systemRpc.label-polygon' },
  { key: 'rpc_endpoint_arbitrum', labelKey: 'systemRpc.label-arbitrum' },
  { key: 'rpc_endpoint_base', labelKey: 'systemRpc.label-base' },
  { key: 'rpc_endpoint_xlayer', labelKey: 'systemRpc.label-xlayer' },
  { key: 'rpc_endpoint_tron', labelKey: 'systemRpc.label-tron' },
  { key: 'rpc_endpoint_solana', labelKey: 'systemRpc.label-solana' },
  { key: 'rpc_endpoint_aptos', labelKey: 'systemRpc.label-aptos' },
  { key: 'rpc_endpoint_plasma', labelKey: 'systemRpc.label-plasma' },
  { key: 'rpc_global_config_url_ton', labelKey: 'systemRpc.label-ton-config' },
]

/** 状态总览网络：旧版 allNetworks 顺序与配色 */
export const STAT_NETWORKS: StatNetworkDef[] = [
  { key: 'rpc_endpoint_tron', statKey: 'tron', netKey: 'systemRpc.net-tron', color: '#e8503a' },
  { key: 'rpc_endpoint_ethereum', statKey: 'ethereum', netKey: 'systemRpc.net-ethereum', color: '#627eea' },
  { key: 'rpc_endpoint_bsc', statKey: 'bsc', netKey: 'systemRpc.net-bsc', color: '#f0b90b' },
  { key: 'rpc_endpoint_polygon', statKey: 'polygon', netKey: 'systemRpc.net-polygon', color: '#8247e5' },
  { key: 'rpc_endpoint_arbitrum', statKey: 'arbitrum', netKey: 'systemRpc.net-arbitrum', color: '#28a0f0' },
  { key: 'rpc_endpoint_base', statKey: 'base', netKey: 'systemRpc.net-base', color: '#0052ff' },
  { key: 'rpc_endpoint_xlayer', statKey: 'xlayer', netKey: 'systemRpc.net-xlayer', color: '#111827' },
  { key: 'rpc_endpoint_solana', statKey: 'solana', netKey: 'systemRpc.net-solana', color: '#9945ff' },
  { key: 'rpc_endpoint_aptos', statKey: 'aptos', netKey: 'systemRpc.net-aptos', color: '#00c2cb' },
  { key: 'rpc_endpoint_plasma', statKey: 'plasma', netKey: 'systemRpc.net-plasma', color: '#ff6b35' },
  { key: 'rpc_global_config_url_ton', statKey: 'ton', netKey: 'systemRpc.net-ton', color: '#0088cc' },
]

/**
 * 解析 /api/conf/rpc 返回的 stats（Go: map[string]info）。
 * 对 null / 缺失 / 非对象 / 单项非法均兜底，只保留合法项。
 */
export function parseStats(raw: unknown): Record<string, RpcStat> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const result: Record<string, RpcStat> = {}
  for (const [net, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    if (typeof item.block !== 'string') continue
    if (typeof item.succ !== 'string') continue
    const time = typeof item.time === 'number' && Number.isFinite(item.time) ? item.time : 0
    result[net] = { block: item.block, succ: item.succ, time }
  }
  return result
}

/** 成功率分级（旧版阈值：>=95 好、>=80 一般、其余差；NaN 归入差） */
export function successRateLevel(succ?: string): 'good' | 'warn' | 'bad' {
  const value = parseFloat(succ ?? '')
  if (value >= 95) return 'good'
  if (value >= 80) return 'warn'
  return 'bad'
}

/** 最新高度展示（旧版：# + Number(block).toLocaleString()） */
export function formatBlockHeight(block?: string): string {
  if (!block) return ''
  const num = Number(block)
  return `#${Number.isFinite(num) ? num.toLocaleString('en-US') : block}`
}

/** 最后同步时间展示（秒级时间戳 -> YYYY/M/D HH:mm:ss，与旧版 formatTime 一致） */
export function formatStatTime(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 总览排序：有数据的网络排在前面（稳定排序，与旧版 sortedNetworks 一致） */
export function sortStatNetworks<T extends { statKey: string }>(
  defs: T[],
  stats: Record<string, RpcStat>,
): T[] {
  return [...defs].sort(
    (a, b) => Number(Boolean(stats[b.statKey])) - Number(Boolean(stats[a.statKey])),
  )
}

/** URL 校验：必填 + 协议白名单（rpc 节点允许 http/https/ws/wss，普通配置地址允许 http/https） */
export function validateUrl(
  value: string,
  schemes: readonly string[] = RPC_URL_SCHEMES,
): 'required' | 'scheme' | null {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  if (!schemes.some((scheme) => trimmed.toLowerCase().startsWith(scheme))) return 'scheme'
  return null
}

/** RPC 节点地址允许的协议 */
export const RPC_URL_SCHEMES = ['http://', 'https://', 'ws://', 'wss://'] as const

/** 普通配置 URL（如 TON Global Config URL）允许的协议 */
export const CONFIG_URL_SCHEMES = ['http://', 'https://'] as const

/** 保存时的表单数据 */
export interface RpcSaveResult {
  items: { key: string; value: string }[]
  /** 校验失败的字段 key -> 错误码 */
  errors: Record<string, 'required' | 'scheme'>
}

/**
 * 组装保存请求（旧版 handleSave）：
 * - 所有 RPC 节点地址必填（trim 后非空）
 * - 地址协议必须合法
 * - Tron Grid Api Key 可选，始终一并保存（空字符串也会写入）
 */
export function buildRpcSaveItems(
  form: Record<string, string>,
  validate: (value: string, key: string) => 'required' | 'scheme' | null = defaultValidate,
): RpcSaveResult {
  const errors: Record<string, 'required' | 'scheme'> = {}
  const items: { key: string; value: string }[] = []

  for (const field of RPC_FIELDS) {
    const value = (form[field.key] ?? '').trim()
    const code = validate(value, field.key)
    if (code) {
      errors[field.key] = code
      continue
    }
    items.push({ key: field.key, value })
  }

  items.push({ key: TRON_GRID_API_KEY, value: (form[TRON_GRID_API_KEY] ?? '').trim() })

  return { items, errors }
}

/** 默认校验：TON Global Config URL 走 http/https，其余节点允许 ws/wss */
function defaultValidate(value: string, key: string): 'required' | 'scheme' | null {
  return validateUrl(value, key === 'rpc_global_config_url_ton' ? CONFIG_URL_SCHEMES : RPC_URL_SCHEMES)
}
