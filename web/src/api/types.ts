/** 后端统一响应结构：{code, msg, data, total} */
export interface ApiResponse<T = unknown> {
  code: number
  msg?: string
  data?: T
  total?: number
}

export interface LoginResult {
  token: string
  types: number[]
}

export interface AuthInfo {
  admin_username: string
  /** 交易类型 -> 别名 */
  trade_type: Record<string, string>
  /** 法币代码为键（值为空对象） */
  trade_fiat: Record<string, unknown>
  /** 币种代码为键（值为 CoinId） */
  trade_crypto: Record<string, string>
  /** 网络 -> 网络名 */
  trade_network: Record<string, string>
}
