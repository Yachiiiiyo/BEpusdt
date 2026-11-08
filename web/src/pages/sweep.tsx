import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronRight, Search, RefreshCw, HandCoins, RotateCcw } from 'lucide-react'
import { fetchSweepInfo, fetchSweepList, retrySweep, collectSweep, type SweepRecord } from '@/api/sweep'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { formatDateTime, truncateAddress } from '@/lib/format'
import {
  buildSweepListReq,
  canRetrySweep,
  formatSweepAmount,
  sweepStateFallback,
  sweepStateKey,
  sweepStateVariant,
  SWEEP_STATES,
  type SweepFilterInput,
} from '@/lib/sweep'
import { cn } from '@/lib/utils'

const SWEEP_LIST_KEY = 'sweep-list'
const SWEEP_INFO_KEY = 'sweep-info'

const DEFAULT_SIZE = 10

/* ------------------------------ 筛选（URL 同步） ------------------------------ */

function readSweepState(
  params: URLSearchParams,
): { filters: SweepFilterInput; page: number; size: number } {
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  return {
    filters: {
      order_id: params.get('order_id') ?? '',
      address: params.get('address') ?? '',
      state: params.get('state') ?? '',
    },
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_SIZE,
  }
}

/** 单元格：哈希截断展示 + 复制（与旧版 copyable + shortHash 对齐） */
function TxHashCell({ hash }: { hash: string }) {
  const short = truncateAddress(hash, 8, 6)
  return (
    <span className="flex items-center justify-center gap-1">
      <span className="font-mono text-[12px]" title={hash}>
        {short}
      </span>
      <CopyButton text={hash} />
    </span>
  )
}

/* ---------------------------------- 页面 ---------------------------------- */

export default function SweepPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()
  const { filters, page, size } = useMemo(
    () => readSweepState(searchParams),
    [searchParams],
  )

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

  /* 归集概览（未启用时友好提示，不报错） */
  const infoQuery = useQuery({
    queryKey: [SWEEP_INFO_KEY],
    queryFn: fetchSweepInfo,
  })
  const info = infoQuery.data
  const sweepEnabled = info?.enabled ?? false

  /* 记录列表 */
  const listQuery = useQuery({
    queryKey: [SWEEP_LIST_KEY, filters, page, size],
    placeholderData: keepPreviousData,
    queryFn: () => fetchSweepList(buildSweepListReq(page, size, 'desc', filters)),
  })
  const records = listQuery.data?.data ?? []
  const total = listQuery.data?.total ?? 0

  /* 手动归集：派生地址记录 ID */
  const [deriveId, setDeriveId] = useState('')

  /* 强确认框：重试 / 立即归集（均会发起真实链上转账） */
  const [retryTarget, setRetryTarget] = useState<SweepRecord | null>(null)
  const [collectConfirmOpen, setCollectConfirmOpen] = useState(false)

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [SWEEP_LIST_KEY] })
  }

  const retryMutation = useMutation({
    mutationFn: (id: number) => retrySweep(id),
    onSuccess: () => {
      toast.success(t('sweep.retry-success'))
      setRetryTarget(null)
      invalidateList()
    },
  })

  const collectMutation = useMutation({
    mutationFn: (deriveId: number) => collectSweep(deriveId),
    onSuccess: () => {
      toast.success(t('sweep.collect-success'))
      setCollectConfirmOpen(false)
      invalidateList()
    },
  })

  const stateLabel = (state: string) => {
    const key = sweepStateKey(state)
    return key ? t(key) : sweepStateFallback(state)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('sweep.title')}</h1>

      {/* 归集概览/配置信息 */}
      {infoQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : sweepEnabled ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1 py-1 sm:flex-row sm:gap-4">
              <span className="w-28 shrink-0 text-sm text-muted-foreground">
                {t('sweep.info-dest')}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-sm font-medium break-all font-mono text-[13px]">
                {info?.dest_address}
                <CopyButton text={info?.dest_address ?? ''} />
              </span>
            </div>
            <div className="flex flex-col gap-1 py-1 sm:flex-row sm:gap-4">
              <span className="w-28 shrink-0 text-sm text-muted-foreground">
                {t('sweep.info-gas')}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-sm font-medium break-all font-mono text-[13px]">
                {info?.gas_address}
                <CopyButton text={info?.gas_address ?? ''} />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t('sweep.info-gas-hint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-medium">{t('sweep.info-disabled-title')}</p>
          <p className="mt-1 text-[13px]">{t('sweep.info-disabled-desc')}</p>
        </div>
      )}

      {/* 筛选表单 */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-order-id">
                {t('sweep.filter-order-id')}
              </Label>
              <Input
                id="filter-order-id"
                className="h-10 md:h-9"
                placeholder={t('sweep.filter-order-id-ph')}
                value={filters.order_id}
                onChange={(e) => setFilter({ order_id: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-address">
                {t('sweep.filter-address')}
              </Label>
              <Input
                id="filter-address"
                className="h-10 font-mono text-[13px] md:h-9"
                placeholder={t('sweep.filter-address-ph')}
                value={filters.address}
                onChange={(e) => setFilter({ address: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-state">
                {t('sweep.filter-state')}
              </Label>
              <Select
                value={filters.state || 'all'}
                onValueChange={(v) => setFilter({ state: v === 'all' ? null : v })}
              >
                <SelectTrigger id="filter-state" className="h-10 md:h-9">
                  <SelectValue placeholder={t('sweep.filter-state-ph')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('sweep.filter-all')}</SelectItem>
                  {SWEEP_STATES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {t(s.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-10 md:h-9"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              <Search className="size-4" />
              {t('sweep.search')}
            </Button>
            <Button
              variant="outline"
              className="h-10 md:h-9"
              onClick={resetFilters}
              disabled={listQuery.isFetching}
            >
              <RefreshCw className={cn('size-4', listQuery.isFetching && 'animate-spin')} />
              {t('sweep.reset')}
            </Button>
          </div>

          {/* 手动归集 */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="collect-derive-id">
                {t('sweep.collect-label')}
              </Label>
              <Input
                id="collect-derive-id"
                type="number"
                min={1}
                className="h-10 font-mono md:h-9 sm:max-w-56"
                placeholder={t('sweep.collect-derive-id-ph')}
                value={deriveId}
                disabled={!sweepEnabled}
                onChange={(e) => setDeriveId(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="h-10 bg-emerald-600 text-white hover:bg-emerald-700 md:h-9"
              disabled={!sweepEnabled || collectMutation.isPending}
              onClick={() => {
                const n = Number(deriveId)
                if (!Number.isInteger(n) || n < 1) {
                  toast.warning(t('sweep.collect-derive-id-required'))
                  return
                }
                setCollectConfirmOpen(true)
              }}
            >
              <HandCoins className="size-4" />
              {t('sweep.collect')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 记录列表 */}
      <Card>
        <CardContent className="p-0 pb-4">
          {listQuery.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <EmptyState className="py-16" description={t('empty.title')} />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[1200px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">{t('sweep.column-id')}</TableHead>
                      <TableHead className="min-w-40 text-center">{t('sweep.column-order-id')}</TableHead>
                      <TableHead className="w-24 text-center">{t('sweep.column-derive-index')}</TableHead>
                      <TableHead className="min-w-72 text-center">{t('sweep.column-address')}</TableHead>
                      <TableHead className="w-28 text-center">{t('sweep.column-state')}</TableHead>
                      <TableHead className="w-32 text-center">{t('sweep.column-amount')}</TableHead>
                      <TableHead className="min-w-40 text-center">{t('sweep.column-fund-tx')}</TableHead>
                      <TableHead className="min-w-40 text-center">{t('sweep.column-sweep-tx')}</TableHead>
                      <TableHead className="min-w-40 text-center">{t('sweep.column-return-tx')}</TableHead>
                      <TableHead className="w-20 text-center">{t('sweep.column-attempts')}</TableHead>
                      <TableHead className="min-w-48 text-center">{t('sweep.column-last-error')}</TableHead>
                      <TableHead className="min-w-36 text-center">{t('sweep.column-updated-at')}</TableHead>
                      <TableHead className="w-24 text-center">{t('sweep.column-actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="text-center text-muted-foreground">
                          {record.id}
                        </TableCell>
                        <TableCell
                          className="max-w-40 truncate text-center"
                          title={record.order_id}
                        >
                          {record.order_id || '-'}
                        </TableCell>
                        <TableCell className="text-center">{record.derive_index}</TableCell>
                        <TableCell className="text-center">
                          <span className="flex items-center justify-center gap-1">
                            <span className="font-mono text-[12px]" title={record.address}>
                              {truncateAddress(record.address, 10, 8)}
                            </span>
                            <CopyButton text={record.address} />
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={sweepStateVariant(record.state)}>
                            {stateLabel(record.state)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {formatSweepAmount(record.amount) || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.fund_tx ? <TxHashCell hash={record.fund_tx} /> : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.sweep_tx ? <TxHashCell hash={record.sweep_tx} /> : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.return_tx ? <TxHashCell hash={record.return_tx} /> : '-'}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {record.attempts}
                        </TableCell>
                        <TableCell
                          className="max-w-48 truncate text-center text-muted-foreground"
                          title={record.last_error}
                        >
                          {record.last_error || '-'}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap text-muted-foreground">
                          {formatDateTime(record.updated_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center">
                            {canRetrySweep(record.state) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
                                disabled={retryMutation.isPending}
                                onClick={() => setRetryTarget(record)}
                              >
                                <RotateCcw className="size-3.5" />
                                {t('sweep.action-retry')}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
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

      {/* 重试确认框（会发起链上转账） */}
      <ConfirmDialog
        open={retryTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRetryTarget(null)
        }}
        title={t('sweep.retry-title')}
        description={
          <>
            {t('sweep.retry-desc', { id: retryTarget?.id ?? 0 })}
            <span className="mt-2 flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <ChevronRight className="size-3.5" />
              {t('sweep.retry-chain-warning')}
            </span>
          </>
        }
        confirmText={t('sweep.action-retry')}
        destructive
        loading={retryMutation.isPending}
        onConfirm={() => {
          if (retryTarget) retryMutation.mutate(retryTarget.id)
        }}
      />

      {/* 立即归集确认框（会发起链上转账） */}
      <ConfirmDialog
        open={collectConfirmOpen}
        onOpenChange={(next) => {
          if (collectMutation.isPending) return
          if (!next) setCollectConfirmOpen(false)
        }}
        title={t('sweep.collect-title')}
        description={
          <>
            {t('sweep.collect-desc', { id: deriveId })}
            <span className="mt-2 flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <ChevronRight className="size-3.5" />
              {t('sweep.collect-chain-warning')}
            </span>
          </>
        }
        confirmText={t('sweep.collect')}
        destructive
        loading={collectMutation.isPending}
        onConfirm={() => {
          const n = Number(deriveId)
          if (Number.isInteger(n) && n >= 1) collectMutation.mutate(n)
        }}
      />
    </div>
  )
}
