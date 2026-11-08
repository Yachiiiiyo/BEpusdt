import { asArray } from '@/lib/trade-meta'
import { post, postWithTotal } from './client'

/** POST /api/rate/{list,syntax,set_syntax,sync}（app/handler/admin/rate.go） */

export interface Rate {
  id: number
  created_at: string | null
  updated_at: string | null
  rate: string
  fiat: string
  crypto: string
  raw_rate: number
  syntax: string
}

export interface RateListReq {
  page: number
  size: number
  sort?: string
  fiat?: string
  crypto?: string
  /** [start, end] 时间范围 */
  datetime?: string[]
}

export interface RateSyntax {
  key: string
  fiat: string
  crypto: string
  syntax: string
}

export interface RateSetSyntaxReq {
  fiat: string
  crypto: string
  syntax: string
}

export function fetchRateList(
  req: RateListReq,
): Promise<{ data: Rate[]; total: number }> {
  return postWithTotal<Rate[]>('/api/rate/list', req)
}

export function fetchRateSyntax(): Promise<RateSyntax[]> {
  // 空切片可能是 null（Go nil slice），统一兜底成 []
  return post<RateSyntax[] | null>('/api/rate/syntax').then((d) => asArray<RateSyntax>(d))
}

export function setRateSyntax(req: RateSetSyntaxReq): Promise<void> {
  return post<void>('/api/rate/set_syntax', req)
}

export function syncRate(): Promise<void> {
  return post<void>('/api/rate/sync')
}
