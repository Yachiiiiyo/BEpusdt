import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Search } from 'lucide-react'
import {
  fetchOrderDetail,
  fetchOrderList,
  markOrderPaid,
  manualNotifyOrder,
  cancelOrder,
  deleteOrders,
  type Order,
} from '@/api/order'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { CopyButton } from '@/components/copy-button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useTradeMeta } from '@/hooks/use-trade-meta'
import { formatDateTime } from '@/lib/format'
import {
  buildOrderListReq,
  canCancel,
  canManualNotify,
  canManualPaid,
  cryptoBadgeVariant,
  getCurrencySymbol,
  getMerchantWebsite,
  notifyStateKey,
  ORDER_STATUS_OPTIONS,
  orderStatusKey,
  orderStatusVariant,
  type OrderFilterInput,
} from '@/lib/order'
import { cn } from '@/lib/utils'

/** 订单列表 query key 前缀，写操作成功后统一 invalidate */
const ORDER_LIST_KEY = 'order-list'
const ORDER_DETAIL_KEY = 'order-detail'

const DEFAULT_SIZE = 10

/* ------------------------------ 筛选（URL 同步） ------------------------------ */

/** 从 URL 查询参数读取筛选与分页状态（刷新页面保持状态） */
function readOrderState(
  params: URLSearchParams,
): { filters: OrderFilterInput; page: number; size: number } {
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  return {
    filters: {
      order_id: params.get('order_id') ?? '',
      trade_id: params.get('trade_id') ?? '',
      trade_type: params.get('trade_type') ?? '',
      address: params.get('address') ?? '',
      status: Number(params.get('status')) || 0,
      start_at: params.get('start') ?? '',
      end_at: params.get('end') ?? '',
    },
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_SIZE,
  }
}

/* --------------------------------- 补单弹窗 --------------------------------- */

/** 补单（标记已支付）确认框，带可选交易哈希输入 */
function PaidDialog({
  order,
  onOpenChange,
}: {
  order: Order | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [refHash, setRefHash] = useState('')

  const mutation = useMutation({
    mutationFn: (input: { id: number; refHash: string }) =>
      markOrderPaid(input.id, input.refHash),
    onSuccess: () => {
      toast.success(t('order.paid-success'))
      setRefHash('')
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: [ORDER_LIST_KEY] })
    },
  })

  return (
    <Dialog
      open={order !== null}
      onOpenChange={(next) => {
        if (mutation.isPending) return
        if (!next) setRefHash('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('order.paid-title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('order.paid-title')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            <p className="font-medium">{t('order.paid-warning-title')}</p>
            <p className="mt-1 text-[13px]">{t('order.paid-warning')}</p>
          </div>
          {order && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="paid-order">{t('order.column-order-id')}</Label>
              <p className="break-all font-mono text-[13px]">{order.order_id}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="paid-ref-hash">{t('order.paid-ref-hash')}</Label>
            <Input
              id="paid-ref-hash"
              className="font-mono"
              maxLength={200}
              placeholder={t('order.paid-ref-hash-ph')}
              value={refHash}
              onChange={(e) => setRefHash(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('order.paid-ref-hash-hint')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-10 md:h-9"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            className="h-10 md:h-9"
            disabled={mutation.isPending}
            onClick={() => {
              if (!order) return
              mutation.mutate({ id: order.id, refHash })
            }}
          >
            {t('order.paid-confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------- 详情弹窗 --------------------------------- */

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-4">
      <span className="w-36 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 text-sm font-medium break-words',
          mono && 'font-mono text-[13px] break-all',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background px-4">
        {children}
      </div>
    </section>
  )
}

function CopyText({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-1">
      <span className="min-w-0 break-all">{children}</span>
      <CopyButton text={text} />
    </span>
  )
}

/** 订单详情弹窗（对齐旧版 components/detail.vue） */
function OrderDetailDialog({
  orderId,
  onOpenChange,
  onActionDone,
}: {
  /** null 表示关闭 */
  orderId: number | null
  onOpenChange: (open: boolean) => void
  /** 详情弹窗内写操作成功后的回调（刷新列表） */
  onActionDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const open = orderId !== null

  const query = useQuery({
    queryKey: [ORDER_DETAIL_KEY, orderId],
    queryFn: () => fetchOrderDetail(orderId as number),
    enabled: open,
  })

  const detail = query.data

  const invalidateAll = () => {
    onActionDone()
    if (orderId !== null) {
      void queryClient.invalidateQueries({ queryKey: [ORDER_DETAIL_KEY, orderId] })
    }
  }

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelOrder(id),
    onSuccess: () => {
      toast.success(t('order.cancel-success'))
      invalidateAll()
      onOpenChange(false)
    },
  })

  const notifyMutation = useMutation({
    mutationFn: (id: number) => manualNotifyOrder(id),
    onSuccess: () => {
      toast.success(t('order.notify-success-toast'))
      invalidateAll()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteOrders([id]),
    onSuccess: () => {
      toast.success(t('order.delete-success'))
      invalidateAll()
      onOpenChange(false)
    },
  })

  // 危险操作确认框状态：cancel / notify / delete
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'notify' | 'delete' | null>(
    null,
  )

  const status = detail?.status ?? 0
  const notifyState = detail?.notify_state ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2">
            {t('order.detail-title')}
            {detail && (
              <Badge variant={orderStatusVariant(status)}>
                {t(orderStatusKey(status))}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('order.detail-title')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">

        {query.isLoading || !detail ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* 基础信息 */}
            <DetailSection title={t('order.detail-basic')}>
              <DetailRow label={t('order.field-name')} value={detail.name || '--'} />
              <DetailRow
                label={t('order.field-trade-type')}
                value={<Badge variant="secondary">{detail.trade_type}</Badge>}
              />
              <DetailRow
                label={t('order.field-order-id')}
                value={<CopyText text={detail.order_id}>{detail.order_id}</CopyText>}
                mono
              />
              <DetailRow
                label={t('order.field-trade-id')}
                value={<CopyText text={detail.trade_id}>{detail.trade_id}</CopyText>}
                mono
              />
              <DetailRow
                label={t('order.field-money')}
                value={
                  <>
                    {getCurrencySymbol(detail.fiat)}
                    {detail.money}
                    <span className="ml-1 text-muted-foreground">({detail.rate})</span>
                    <Badge variant="secondary" className="ml-2">
                      {detail.fiat}
                    </Badge>
                  </>
                }
              />
              <DetailRow
                label={t('order.field-amount')}
                value={
                  <>
                    {detail.amount}
                    <Badge
                      variant={cryptoBadgeVariant(detail.crypto)}
                      className="ml-2"
                    >
                      {detail.crypto}
                    </Badge>
                  </>
                }
              />
            </DetailSection>

            {/* 交易地址 */}
            <DetailSection title={t('order.detail-address')}>
              <DetailRow
                label={t('order.field-receive-address')}
                value={
                  <CopyText text={detail.address}>{detail.address}</CopyText>
                }
                mono
              />
              {detail.from_address && (
                <DetailRow
                  label={t('order.field-from-address')}
                  value={
                    <CopyText text={detail.from_address}>
                      {detail.from_address}
                    </CopyText>
                  }
                  mono
                />
              )}
            </DetailSection>

            {/* 回调信息（交易成功 / 等待确认） */}
            {(status === 2 || status === 5) && (
              <DetailSection title={t('order.detail-notify')}>
                <DetailRow
                  label={t('order.field-notify-state')}
                  value={
                    notifyState === 1 ? (
                      <Badge variant="success">{t('order.notify-success')}</Badge>
                    ) : (
                      <Badge variant="destructive">
                        {t('order.notify-waiting-retry', { num: detail.notify_num + 1 })}
                      </Badge>
                    )
                  }
                />
                {detail.return_url && (
                  <DetailRow
                    label={t('order.field-merchant-site')}
                    value={
                      <a
                        href={getMerchantWebsite(detail.return_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary hover:underline"
                      >
                        {getMerchantWebsite(detail.return_url)}
                      </a>
                    }
                  />
                )}
              </DetailSection>
            )}

            {/* 区块链数据（交易成功 / 等待确认） */}
            {(status === 2 || status === 5) && detail.ref_hash && (
              <DetailSection title={t('order.detail-blockchain')}>
                {detail.ref_block_num > 0 && (
                  <DetailRow
                    label={t('order.field-block-num')}
                    value={detail.ref_block_num}
                  />
                )}
                <DetailRow
                  label={t('order.field-ref-hash')}
                  value={
                    <CopyText text={detail.ref_hash}>{detail.ref_hash}</CopyText>
                  }
                  mono
                />
                <DetailRow
                  label={t('order.field-tx-url')}
                  value={
                    status === 2 && detail.tx_url ? (
                      <a
                        href={detail.tx_url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-mono text-[12px] text-primary hover:underline"
                      >
                        {detail.tx_url}
                      </a>
                    ) : (
                      <Badge variant="secondary">{t('order.field-tx-pending')}</Badge>
                    )
                  }
                />
              </DetailSection>
            )}

            {/* 订单时间 */}
            <DetailSection title={t('order.detail-time')}>
              {detail.created_at && (
                <DetailRow
                  label={t('order.field-created-at')}
                  value={formatDateTime(detail.created_at)}
                />
              )}
              <DetailRow
                label={
                  detail.confirmed_at && (status === 2 || status === 5)
                    ? t('order.field-confirmed-at')
                    : status === 3
                      ? t('order.field-expired-at')
                      : t('order.field-updated-at')
                }
                value={formatDateTime(
                  detail.confirmed_at && (status === 2 || status === 5)
                    ? detail.confirmed_at
                    : status === 3
                      ? detail.expired_at
                      : detail.updated_at,
                )}
              />
            </DetailSection>

            {/* 操作（条件与旧版 detail.vue footer 一致） */}
            <div className="flex flex-wrap gap-2">
              {canManualNotify(status, notifyState) && (
                <Button
                  className="h-10 md:h-9"
                  onClick={() => setConfirmAction('notify')}
                  disabled={notifyMutation.isPending}
                >
                  {t('order.action-notify')}
                </Button>
              )}
              {canCancel(status) && (
                <Button
                  variant="outline"
                  className="h-10 md:h-9"
                  onClick={() => setConfirmAction('cancel')}
                  disabled={cancelMutation.isPending}
                >
                  {t('order.action-cancel')}
                </Button>
              )}
              <Button
                variant="outline"
                className="h-10 text-destructive hover:text-destructive md:h-9"
                onClick={() => setConfirmAction('delete')}
                disabled={deleteMutation.isPending}
              >
                {t('order.action-delete')}
              </Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>

      {/* 详情弹窗内危险操作确认框 */}
      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmAction(null)
        }}
        title={
          confirmAction === 'cancel'
            ? t('order.cancel-title')
            : confirmAction === 'notify'
              ? t('order.notify-title')
              : t('order.delete-title')
        }
        description={
          confirmAction === 'cancel'
            ? t('order.cancel-desc')
            : confirmAction === 'notify'
              ? t('order.notify-desc', { orderId: detail?.order_id ?? '' })
              : t('order.delete-desc')
        }
        confirmText={
          confirmAction === 'cancel'
            ? t('order.action-cancel')
            : confirmAction === 'notify'
              ? t('order.notify-confirm')
              : t('order.action-delete')
        }
        destructive={confirmAction === 'delete'}
        loading={
          cancelMutation.isPending ||
          notifyMutation.isPending ||
          deleteMutation.isPending
        }
        onConfirm={() => {
          if (!detail) return
          if (confirmAction === 'cancel') cancelMutation.mutate(detail.id)
          else if (confirmAction === 'notify') notifyMutation.mutate(detail.id)
          else if (confirmAction === 'delete') deleteMutation.mutate(detail.id)
        }}
      />
    </Dialog>
  )
}

/* ---------------------------------- 页面 ---------------------------------- */

export default function OrderPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { tradeTypes } = useTradeMeta()

  const [searchParams, setSearchParams] = useSearchParams()
  const { filters, page, size } = useMemo(
    () => readOrderState(searchParams),
    [searchParams],
  )

  /** 更新查询参数（resetPage 为 true 时回到第 1 页） */
  const updateParams = (
    patch: Record<string, string | null>,
    resetPage = true,
  ) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        }
        if (resetPage) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const setFilter = (patch: Record<string, string | null>) => {
    updateParams(patch, true)
  }

  const query = useQuery({
    queryKey: [ORDER_LIST_KEY, filters, page, size],
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchOrderList(buildOrderListReq(page, size, 'desc', filters)),
  })

  const orders = query.data?.data ?? []
  const total = query.data?.total ?? 0

  const [paidOrder, setPaidOrder] = useState<Order | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [ORDER_LIST_KEY] })
  }

  const resetFilters = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams()
        if (prev.get('size')) next.set('size', prev.get('size') as string)
        return next
      },
      { replace: true },
    )
  }

  const walletLabel = (order: Order) =>
    order.wallet?.name || (order.address ? order.address.slice(-8) : '--')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('order.title')}</h1>

      {/* 筛选表单（字段与 app/handler/admin/order.go oListReq 对齐） */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-order-id">
                {t('order.filter-order-id')}
              </Label>
              <Input
                id="filter-order-id"
                className="h-10 md:h-9"
                placeholder={t('order.filter-order-id-ph')}
                value={filters.order_id}
                onChange={(e) => setFilter({ order_id: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-trade-id">
                {t('order.filter-trade-id')}
              </Label>
              <Input
                id="filter-trade-id"
                className="h-10 md:h-9"
                placeholder={t('order.filter-trade-id-ph')}
                value={filters.trade_id}
                onChange={(e) => setFilter({ trade_id: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-trade-type">
                {t('order.filter-trade-type')}
              </Label>
              <Select
                value={filters.trade_type || 'all'}
                onValueChange={(v) => setFilter({ trade_type: v === 'all' ? null : v })}
              >
                <SelectTrigger id="filter-trade-type" className="h-10 md:h-9">
                  <SelectValue placeholder={t('order.filter-trade-type-ph')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('order.filter-all')}</SelectItem>
                  {tradeTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-status">
                {t('order.filter-status')}
              </Label>
              <Select
                value={filters.status > 0 ? String(filters.status) : 'all'}
                onValueChange={(v) =>
                  setFilter({ status: v === 'all' ? null : v })
                }
              >
                <SelectTrigger id="filter-status" className="h-10 md:h-9">
                  <SelectValue placeholder={t('order.filter-status-ph')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('order.filter-all')}</SelectItem>
                  {ORDER_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={String(status)}>
                      {t(orderStatusKey(status))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-address">
                {t('order.filter-address')}
              </Label>
              <Input
                id="filter-address"
                className="h-10 font-mono text-[13px] md:h-9"
                placeholder={t('order.filter-address-ph')}
                value={filters.address}
                onChange={(e) => setFilter({ address: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-start">
                {t('order.filter-start-at')}
              </Label>
              <Input
                id="filter-start"
                type="datetime-local"
                className="h-10 md:h-9"
                value={filters.start_at}
                onChange={(e) => setFilter({ start: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-end">
                {t('order.filter-end-at')}
              </Label>
              <Input
                id="filter-end"
                type="datetime-local"
                className="h-10 md:h-9"
                value={filters.end_at}
                onChange={(e) => setFilter({ end: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-10 md:h-9"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <Search className="size-4" />
              {t('order.search')}
            </Button>
            <Button
              variant="outline"
              className="h-10 md:h-9"
              onClick={resetFilters}
              disabled={query.isFetching}
            >
              <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
              {t('order.reset')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      <Card>
        <CardContent className="p-0 pb-4">
          {query.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState className="py-16" description={t('empty.title')} />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table className="[&_td]:px-2 [&_th]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-center">{t('order.column-id')}</TableHead>
                      <TableHead className="text-center">{t('order.column-order-id')}</TableHead>
                      <TableHead className="text-center">{t('order.column-trade-type')}</TableHead>
                      <TableHead className="text-center">{t('order.column-amount')}</TableHead>
                      <TableHead className="text-center">{t('order.column-money')}</TableHead>
                      <TableHead className="text-center">{t('order.column-wallet')}</TableHead>
                      <TableHead className="text-center">{t('order.column-status')}</TableHead>
                      <TableHead className="text-center">{t('order.column-notify')}</TableHead>
                      <TableHead className="text-center">{t('order.column-created-at')}</TableHead>
                      <TableHead className="w-px whitespace-nowrap text-center">{t('order.column-actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const notifyKey = notifyStateKey(order.status, order.notify_state)
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="text-center text-muted-foreground">
                            {order.id}
                          </TableCell>
                          <TableCell
                            className="max-w-36 truncate text-center"
                            title={order.order_id}
                          >
                            {order.order_id}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            <Badge variant="secondary">{order.trade_type}</Badge>
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            <span className="font-medium">{order.amount}</span>
                            <Badge
                              variant={cryptoBadgeVariant(order.crypto)}
                              className="ml-1"
                            >
                              {order.crypto}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            <span className="font-medium">{order.money}</span>
                            <Badge variant="secondary" className="ml-1">
                              {order.fiat}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="max-w-24 truncate text-center"
                            title={`${walletLabel(order)} ${order.address}`}
                          >
                            <span className="text-primary">{walletLabel(order)}</span>
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            <Badge variant={orderStatusVariant(order.status)}>
                              {t(orderStatusKey(order.status))}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {notifyKey ? (
                              <Badge
                                variant={
                                  notifyKey === 'order.notify-success'
                                    ? 'secondary'
                                    : 'destructive'
                                }
                              >
                                {t(notifyKey)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap text-muted-foreground">
                            {formatDateTime(order.created_at)}
                          </TableCell>
                          <TableCell className="w-px whitespace-nowrap">
                            <div className="flex flex-nowrap items-center justify-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => setDetailId(order.id)}
                              >
                                {t('order.action-detail')}
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 bg-amber-600 text-white hover:bg-amber-700"
                                disabled={!canManualPaid(order.status)}
                                title={
                                  canManualPaid(order.status)
                                    ? undefined
                                    : t('order.action-paid-disabled')
                                }
                                onClick={() => setPaidOrder(order)}
                              >
                                {t('order.action-paid')}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                className="p-4"
                page={page}
                size={size}
                total={total}
                onPageChange={(p: number) => updateParams({ page: String(p) }, false)}
                onSizeChange={(s: number) => updateParams({ size: String(s) }, false)}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* 补单确认框 */}
      <PaidDialog
        order={paidOrder}
        onOpenChange={(next) => {
          if (next) setPaidOrder(paidOrder)
          else setPaidOrder(null)
        }}
      />

      {/* 详情弹窗 */}
      <OrderDetailDialog
        orderId={detailId}
        onOpenChange={(next) => {
          if (!next) setDetailId(null)
        }}
        onActionDone={invalidateList}
      />

    </div>
  )
}
