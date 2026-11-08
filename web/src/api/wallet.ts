import { post, postWithTotal } from './client'

/** POST /api/wallet/{list,add,mod,del}（app/handler/admin/wallet.go） */

/** 列表通用参数（app/handler/base/request.go ListRequest） */
export interface ListReq {
  page: number
  size: number
  keyword?: string
  /** asc / desc */
  sort?: string
}

export interface Wallet {
  id: number
  created_at: string | null
  updated_at: string | null
  name: string
  /** 1 启用 / 2 禁用（model.WaStatusEnable 等） */
  status: number
  address: string
  match_addr: string
  trade_type: string
  other_notify: number
  remark: string
}

export interface WalletListReq extends ListReq {
  name?: string
  address?: string
  trade_type?: string
}

export interface WalletAddReq {
  name?: string
  remark?: string
  address: string
  trade_type: string
  other_notify?: number
}

/** mod 的字段均为可选指针，未传不修改 */
export interface WalletModReq {
  id: number
  name?: string
  status?: number
  address?: string
  remark?: string
  trade_type?: string
  other_notify?: number
}

export function fetchWalletList(
  req: WalletListReq,
): Promise<{ data: Wallet[]; total: number }> {
  return postWithTotal<Wallet[]>('/api/wallet/list', req)
}

export function addWallet(req: WalletAddReq): Promise<void> {
  return post<void>('/api/wallet/add', req)
}

export function modWallet(req: WalletModReq): Promise<void> {
  return post<void>('/api/wallet/mod', req)
}

export function delWallet(id: number): Promise<void> {
  return post<void>('/api/wallet/del', { id })
}
