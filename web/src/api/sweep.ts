import { post, postWithTotal } from './client'

/** POST /api/sweep/{list,retry,collect,info}（app/handler/admin/sweep.go） */

export interface SweepRecord {
  id: number
  created_at: string | null
  updated_at: string | null
  order_id: string
  trade_id: string
  derive_index: number
  address: string
  dest_address: string
  state: string
  amount: string
  fund_tx: string
  sweep_tx: string
  return_tx: string
  fund_value: string
  attempts: number
  return_tries: number
  next_retry_at: string | null
  last_error: string
}

export interface SweepListReq {
  page: number
  size: number
  sort?: string
  state?: string
  address?: string
  order_id?: string
}

export interface SweepInfo {
  enabled: boolean
  dest_address: string
  gas_address: string
  trade_types: string[]
}

export function fetchSweepList(
  req: SweepListReq,
): Promise<{ data: SweepRecord[]; total: number }> {
  return postWithTotal<SweepRecord[]>('/api/sweep/list', req)
}

export function retrySweep(id: number): Promise<void> {
  return post<void>('/api/sweep/retry', { id })
}

export function collectSweep(deriveId: number): Promise<void> {
  return post<void>('/api/sweep/collect', { derive_id: deriveId })
}

export function fetchSweepInfo(): Promise<SweepInfo> {
  return post<SweepInfo>('/api/sweep/info')
}
