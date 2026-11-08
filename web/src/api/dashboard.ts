import { post } from './client'

/** POST /api/dashboard/home（app/handler/admin/dashboard.go homeReq / buildDashboardHome） */

export interface DashboardHomeReq {
  fiat: string
  /** today / 7d / 30d / custom，空串后端默认 7d */
  range?: string
  /** IANA 时区名，如 Asia/Shanghai */
  tz?: string
  /** custom 范围开始，支持 RFC3339 / 2006-01-02 15:04:05 / 2006-01-02 */
  from?: string
  /** custom 范围结束 */
  to?: string
  /** 跳过缓存 */
  force?: boolean
}

export interface DashboardKpi {
  orders_total: number
  orders_pending: number
  orders_confirming: number
  gmv_paid: string
  orders_success: number
  orders_failed: number
  notify_failed: number
  order_success_rate: string
}

export interface DashboardPoint {
  date: string
  orders_total: number
  orders_paid: number
  orders_success: number
  orders_failed: number
  gmv_paid: string
}

export interface DashboardHome {
  range: string
  from: string
  to: string
  timezone: string
  currency: string
  kpi: DashboardKpi
  /** 币种 → 成交数量（USDT/USDC/TRX/BNB/ETH…） */
  token_map: Record<string, number>
  points: DashboardPoint[]
}

export function fetchDashboardHome(req: DashboardHomeReq): Promise<DashboardHome> {
  return post<DashboardHome>('/api/dashboard/home', req)
}
