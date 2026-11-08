/**
 * 汇率语法纯逻辑，逐行对齐旧版 Vue 后台（05da72e）web/src/views/rate/syntax.vue 的
 * parseSyntax / generateSyntax / 校验 / 描述文案，
 * 以及后端 app/model/rate.go 的 ParseFloatRate（用于预览，语义一致）。
 *
 * 语法含义（与后端 rate_float_<crypto>_<fiat> 一致）：
 * - ""      市场汇率：订单汇率 = 基准汇率，随市场波动
 * - "7.4"   固定汇率：订单汇率强制固定为该值
 * - "+0.3" / "-0.2" 固定浮动：订单汇率 = 基准汇率 ± 数值
 * - "~1.02" 比例浮动：订单汇率 = 基准汇率 * 数值
 */

export type SyntaxType = 'market' | 'fixed' | '~' | ''

export interface ParsedSyntax {
  type: SyntaxType
  value: number | undefined
}

/** 旧版 parseSyntax：空 → market；~x → 比例；+x/-x → fixed；其余数字 → 固定值 */
export function parseSyntax(syntax: string): ParsedSyntax {
  if (syntax === '' || syntax === null || syntax === undefined) {
    return { type: 'market', value: undefined }
  }
  if (syntax.startsWith('~')) {
    return { type: '~', value: parseFloat(syntax.substring(1)) }
  }
  if (syntax.startsWith('+')) {
    return { type: 'fixed', value: parseFloat(syntax.substring(1)) }
  }
  if (syntax.startsWith('-')) {
    return { type: 'fixed', value: -parseFloat(syntax.substring(1)) }
  }
  return { type: '', value: parseFloat(syntax) }
}

/** 旧版 formatValue：保留最多 6 位小数，去掉末尾的 0 */
export function formatValue(val: number): string {
  return parseFloat(val.toFixed(6)).toString()
}

/**
 * 旧版 generateSyntax：由编辑器状态生成保存到后端的语法串。
 * market 或无数值时返回 ""（即市场汇率）。
 */
export function generateSyntax(
  type: SyntaxType,
  value: number | undefined | null,
): string {
  if (type === 'market') return ''
  if (value === undefined || value === null) return ''

  if (type === 'fixed') {
    return value >= 0
      ? '+' + formatValue(value)
      : '-' + formatValue(Math.abs(value))
  }
  return type + formatValue(value)
}

export type SyntaxValidationError =
  | 'missing-value'
  | 'ratio-positive'
  | 'fixed-negative'
  | null

/** 旧版 handleEditSubmit 的前端校验（不含交易对完整性，那属于页面状态） */
export function validateSyntax(
  type: SyntaxType,
  value: number | undefined | null,
): SyntaxValidationError {
  if (type === 'market') return null
  if (value === undefined || value === null) return 'missing-value'
  if (type === '~') {
    if (value <= 0) return 'ratio-positive'
  } else if (type === '' && value < 0) {
    return 'fixed-negative'
  }
  return null
}

export type SyntaxDescriptionMode =
  | 'market'
  | 'fixed-float'
  | 'ratio'
  | 'fixed-value'

export interface SyntaxDescription {
  mode: SyntaxDescriptionMode
  /** formatValue 后的数值（描述文案用） */
  value?: string
}

/**
 * 旧版 getTableSyntaxDescription 的结构化版本：
 * 空语法 → market；解析不出数值 → null（旧版返回空串）。
 */
export function describeSyntax(syntax: string): SyntaxDescription | null {
  if (syntax === '' || syntax === null || syntax === undefined) {
    return { mode: 'market' }
  }
  const parsed = parseSyntax(syntax)
  if (parsed.value === undefined || parsed.value === null) return null
  if (Number.isNaN(parsed.value)) return null

  switch (parsed.type) {
    case 'fixed':
      return { mode: 'fixed-float', value: formatValue(parsed.value) }
    case '~':
      return { mode: 'ratio', value: formatValue(parsed.value) }
    default:
      return { mode: 'fixed-value', value: formatValue(parsed.value) }
  }
}

/**
 * 旧版 getFormSyntaxDescription 的结构化版本（编辑表单实时预览）。
 */
export function describeFormSyntax(
  type: SyntaxType,
  value: number | undefined | null,
): SyntaxDescription {
  const hasValue = value !== undefined && value !== null && !Number.isNaN(value)

  switch (type) {
    case 'market':
      return { mode: 'market' }
    case 'fixed':
      if (!hasValue) return { mode: 'fixed-float' }
      return { mode: 'fixed-float', value: formatValue(value as number) }
    case '~':
      if (!hasValue) return { mode: 'ratio' }
      return { mode: 'ratio', value: formatValue(value as number) }
    default:
      if (!hasValue) return { mode: 'fixed-value' }
      return { mode: 'fixed-value', value: formatValue(value as number) }
  }
}

/**
 * 旧版 handleSyntaxTypeChange 中切换类型时的默认值逻辑：
 * market → 清空；~ 且当前无值或为 0 → 1；非 ~ 且当前为 1 → 0。
 */
export function defaultSyntaxValueOnTypeChange(
  type: SyntaxType,
  current: number | undefined | null,
): number | undefined {
  if (type === 'market') return undefined
  if (type === '~' && (current === undefined || current === null || current === 0)) {
    return 1.0
  }
  if (type !== '~' && current === 1) return 0
  return current === undefined || current === null ? undefined : current
}

/* ------------------------------ 预览（与后端一致） ------------------------------ */

function isNumber(s: string): boolean {
  return /^\d+\.?\d*$/.test(s)
}

function round4(val: number): number {
  // Go: math.Floor(val*10000+0.5) / 10000
  return Math.floor(val * 10000 + 0.5) / 10000
}

/**
 * 对齐 app/model/rate.go ParseFloatRate：
 * 空语法 → 基准汇率；纯数字 → 固定值；^[~+-]\d+(\.\d+)?$ → 加/减/乘；
 * 非法语法返回 0（与后端一致，后端只打日志）。
 */
export function parseFloatRate(syntax: string, rawVal: number): number {
  if (syntax === '') return rawVal
  if (isNumber(syntax)) return parseFloat(syntax)
  if (!/^[~+-]\d+(\.\d+)?$/.test(syntax)) return 0

  const act = syntax[0]
  const base = parseFloat(syntax.substring(1))
  switch (act) {
    case '~':
      return round4(rawVal * base)
    case '+':
      return round4(rawVal + base)
    case '-':
      return round4(rawVal - base)
  }
  return 0
}

/* ------------------------------ 同步配置（sync 模态框） ------------------------------ */

export const CUSTOM_API_URL_PRESET = 'custom'

export const API_URL_PRESETS = [
  'https://api.coingecko.com',
  'https://api.bepusdt.online',
] as const

export function normalizeApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function isValidApiUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 后端 rate_sync_interval 存秒，页面显示分钟 */
export function secondsToMinutes(seconds: string | undefined): number {
  if (!seconds) return 60
  const s = parseInt(seconds, 10)
  if (Number.isNaN(s)) return 60
  return Math.round(s / 60)
}

export interface SyncFormState {
  minutes: number
  apiUrlPreset: string
  customApiUrl: string
  apiKey: string
  historyDays: number
}

/** 旧版 resetSyncForm 的默认值 */
export function defaultSyncForm(): SyncFormState {
  return {
    minutes: 60,
    apiUrlPreset: 'https://api.coingecko.com',
    customApiUrl: '',
    apiKey: '',
    historyDays: 30,
  }
}

/** 旧版 syncApiUrlForm：根据已存的 URL 反推下拉选中项 */
export function syncFormFromApiUrl(
  form: SyncFormState,
  value: string | undefined,
): SyncFormState {
  const apiUrl = normalizeApiUrl(value || 'https://api.coingecko.com')
  if ((API_URL_PRESETS as readonly string[]).includes(apiUrl)) {
    return { ...form, apiUrlPreset: apiUrl, customApiUrl: '' }
  }
  return { ...form, apiUrlPreset: CUSTOM_API_URL_PRESET, customApiUrl: apiUrl }
}

export type SyncFormError =
  | 'minutes'
  | 'api-url-empty'
  | 'api-url-invalid'
  | 'history-days'
  | null

/** 旧版 handleSyncSubmit 的前端校验 */
export function validateSyncForm(form: SyncFormState): SyncFormError {
  if (!form.minutes || form.minutes < 10 || form.minutes > 1440) return 'minutes'
  const apiUrl =
    form.apiUrlPreset === CUSTOM_API_URL_PRESET
      ? normalizeApiUrl(form.customApiUrl)
      : form.apiUrlPreset
  if (!apiUrl) return 'api-url-empty'
  if (!isValidApiUrl(apiUrl)) return 'api-url-invalid'
  if (!form.historyDays || form.historyDays < 1 || form.historyDays > 365) {
    return 'history-days'
  }
  return null
}

/** 旧版 handleSyncSubmit 组装的 setsConf 请求体（key/value 数组） */
export function buildSyncConfItems(form: SyncFormState): {
  key: string
  value: string
}[] {
  const apiUrl =
    form.apiUrlPreset === CUSTOM_API_URL_PRESET
      ? normalizeApiUrl(form.customApiUrl)
      : form.apiUrlPreset
  return [
    { key: 'rate_sync_interval', value: (form.minutes * 60).toString() },
    { key: 'rate_sync_coingecko_api_url', value: apiUrl },
    { key: 'rate_sync_coingecko_api_key', value: form.apiKey },
    { key: 'rate_sync_history_days', value: form.historyDays.toString() },
  ]
}

/* ------------------------------ 支付颗粒度（atom 模态框） ------------------------------ */

export const ATOM_KEYS = [
  'atom_usdt',
  'atom_usdc',
  'atom_trx',
  'atom_eth',
  'atom_bnb',
  'atom_gram',
] as const

export type AtomKey = (typeof ATOM_KEYS)[number]

export interface AtomFormState {
  usdt: number
  usdc: number
  trx: number
  eth: number
  bnb: number
  gram: number
}

/** 旧版 showAtomModal/handleAtomCancel 的默认值 */
export function defaultAtomForm(): AtomFormState {
  return {
    usdt: 0.01,
    usdc: 0.01,
    trx: 0.01,
    eth: 0.000001,
    bnb: 0.00001,
    gram: 0.01,
  }
}

/** 从 /api/conf/gets 结果读取颗粒度（缺省用默认值），parseFloat 失败也回退默认 */
export function atomFormFromConf(
  conf: Record<string, string> | undefined,
): AtomFormState {
  const def = defaultAtomForm()
  if (!conf) return def
  const read = (key: AtomKey): number => {
    const field = key.replace('atom_', '') as keyof AtomFormState
    const raw = conf[key]
    if (!raw) return def[field]
    const v = parseFloat(raw)
    return Number.isNaN(v) ? def[field] : v
  }
  return {
    usdt: read('atom_usdt'),
    usdc: read('atom_usdc'),
    trx: read('atom_trx'),
    eth: read('atom_eth'),
    bnb: read('atom_bnb'),
    gram: read('atom_gram'),
  }
}

/** 旧版 handleAtomSubmit 组装的 setsConf 请求体 */
export function buildAtomConfItems(
  form: AtomFormState,
): { key: string; value: string }[] {
  return ATOM_KEYS.map((key) => {
    const field = key.replace('atom_', '') as keyof AtomFormState
    return { key, value: form[field].toString() }
  })
}
