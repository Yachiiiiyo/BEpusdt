import { post, postWithTotal } from './client'

/** POST /api/order/*（app/handler/admin/order.go、app/model/order.go） */

export interface OrderListReq {
  page: number
  size: number
  sort?: string
  name?: string
  money?: string
  amount?: string
  order_id?: string
  trade_id?: string
  status?: number
  address?: string
  trade_type?: string
  start_at?: string
  end_at?: string
}

export interface OrderWallet {
  id: number
  name: string
  status: number
  address: string
  trade_type: string
  other_notify: number
  remark: string
}

export interface Order {
  id: number
  created_at: string | null
  updated_at: string | null
  order_id: string
  trade_id: string
  trade_type: string
  fiat: string
  crypto: string
  currency_limit: string
  rate: string
  amount: string
  money: string
  address: string
  from_address: string
  match_address: string
  address_locked: boolean
  status: number
  name: string
  api_type: string
  return_url: string
  notify_url: string
  notify_num: number
  notify_state: number
  ref_hash: string
  ref_block_num: number
  expired_at: string
  confirmed_at: string | null
  /** 列表接口 Preload 附带的钱包信息 */
  wallet?: OrderWallet
}

export interface OrderDetail extends Order {
  tx_url: string
}

export interface OrderCreateReq {
  amount: number
  order_id: string
  name?: string
  fiat?: string
  currencies?: string
  timeout?: number
}

export interface OrderCreateResult {
  status: string
  message: string
  payment_url: string
}

export function fetchOrderList(
  req: OrderListReq,
): Promise<{ data: Order[]; total: number }> {
  return postWithTotal<Order[]>('/api/order/list', req)
}

export function createOrder(req: OrderCreateReq): Promise<OrderCreateResult> {
  return post<OrderCreateResult>('/api/order/create', req)
}

export function fetchOrderDetail(id: number): Promise<OrderDetail> {
  return post<OrderDetail>('/api/order/detail', { id })
}

/** 标记订单已支付（危险操作，调用方需确认框） */
export function markOrderPaid(id: number, refHash: string): Promise<void> {
  return post<void>('/api/order/paid', { id, ref_hash: refHash })
}

/** 手动回调（危险操作，调用方需确认框） */
export function manualNotifyOrder(id: number): Promise<void> {
  return post<void>('/api/order/manual_notify', { id })
}

export function cancelOrder(id: number): Promise<void> {
  return post<void>('/api/order/cancel', { id })
}

/** 批量删除订单（危险操作，调用方需确认框） */
export function deleteOrders(ids: number[]): Promise<void> {
  return post<void>('/api/order/del', { ids })
}
