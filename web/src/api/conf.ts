import { get, post, postMsg } from './client'

/** GET /api/conf/rpc；POST /api/conf/*（app/handler/admin/conf.go） */

/** conf.GetStats() 里单个网络的统计（app/conf/stat.go info） */
export interface RpcStatInfo {
  /** 区块高度（字符串数字） */
  block: string
  /** 成功率，如 "100.00%" */
  succ: string
  /** 最后同步时间（秒级时间戳） */
  time: number
}

export interface ConfRpc {
  /** ConfKey → 配置值（rpc endpoint 等）；无记录的键可能缺失 */
  rpc: Record<string, string>
  /** 网络名 → 统计信息；刚启动无数据时可能为空对象 */
  stats: Record<string, RpcStatInfo>
}

export interface ConfGetResult {
  key: string
  value: string
}

export interface ConfSetReq {
  key: string
  value: string
}

export interface NotifierConfReq {
  channel: string
  /** 通知渠道参数（Go 侧为 json.RawMessage，传对象即可） */
  params: Record<string, string>
}

export interface Checkout {
  name: string
  author: string
  desc: string
  link: string
}

export function fetchConfRpc(): Promise<ConfRpc> {
  return get<ConfRpc>('/api/conf/rpc')
}

export function setConf(key: string, value: string): Promise<void> {
  return post<void>('/api/conf/set', { key, value })
}

export function getConf(key: string): Promise<ConfGetResult> {
  return post<ConfGetResult>('/api/conf/get', { key })
}

export function delConf(key: string): Promise<void> {
  return post<void>('/api/conf/del', { key })
}

export function getConfs(keys: string[]): Promise<Record<string, string>> {
  return post<Record<string, string>>('/api/conf/gets', { keys })
}

export function setConfs(items: ConfSetReq[]): Promise<void> {
  return post<void>('/api/conf/sets', items)
}

export function setNotifierConf(req: NotifierConfReq): Promise<void> {
  return post<void>('/api/conf/notifier', req)
}

/** 发送测试通知（只触发后端测试发送，不修改配置）。后端把结果放在 msg 返回 */
export function testNotifier(): Promise<string> {
  return postMsg('/api/conf/notifier_test')
}

export function fetchCheckoutList(): Promise<Record<string, Checkout>> {
  return post<Record<string, Checkout>>('/api/conf/checkout_list')
}

/** 重置 API auth token（危险操作，调用方需确认框） */
export function resetApiAuthToken(): Promise<void> {
  return post<void>('/api/conf/reset_api_auth_token')
}
