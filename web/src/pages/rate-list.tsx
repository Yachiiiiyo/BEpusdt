import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Search, RefreshCcw } from 'lucide-react'
import { fetchRateList, syncRate, type Rate } from '@/api/rate'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useTradeMeta } from '@/hooks/use-trade-meta'
import { formatDateTime } from '@/lib/format'
import { cryptoBadgeVariant } from '@/lib/order'
import { buildRateListReq, getFiatFlag } from '@/lib/rate'

/** 汇率列表 query key 前缀，同步成功后统一 invalidate */
const RATE_LIST_KEY = 'rate-list'

const DEFAULT_SIZE = 10

/** 从 URL 查询参数读取筛选与分页状态（与订单页一致） */
function readRateState(
  params: URLSearchParams,
): { filters: { fiat: string; crypto: string; start_at: string; end_at: string }; page: number; size: number } {
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  return {
    filters: {
      fiat: params.get('fiat') ?? '',
      crypto: params.get('crypto') ?? '',
      start_at: params.get('start') ?? '',
      end_at: params.get('end') ?? '',
    },
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_SIZE,
  }
}

export default function RateListPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { tradeFiats, tradeCryptos } = useTradeMeta()

  const [searchParams, setSearchParams] = useSearchParams()
  const { filters, page, size } = useMemo(
    () => readRateState(searchParams),
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

  const query = useQuery({
    queryKey: [RATE_LIST_KEY, filters, page, size],
    placeholderData: keepPreviousData,
    queryFn: () => fetchRateList(buildRateListReq(page, size, 'desc', filters)),
  })

  const rates = query.data?.data ?? []
  const total = query.data?.total ?? 0

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [RATE_LIST_KEY] })
  }

  /** 同步是写操作且会访问外部汇率源：确认框 + loading，成功后刷新列表 */
  const [syncOpen, setSyncOpen] = useState(false)
  const syncMutation = useMutation({
    mutationFn: () => syncRate(),
    onSuccess: () => {
      toast.success(t('rate.list.sync-success'))
      setSyncOpen(false)
      invalidateList()
    },
    // 失败时 client.ts 已统一 toast 后端 msg，这里只负责收起弹窗
    onError: () => setSyncOpen(false),
  })

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('rate.list.title')}</h1>

      {/* 筛选表单（字段与 app/handler/admin/rate.go rateListReq 对齐） */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-fiat">
                {t('rate.list.filter-fiat')}
              </Label>
              <Select
                value={filters.fiat || 'all'}
                onValueChange={(v) => setFilter({ fiat: v === 'all' ? null : v })}
              >
                <SelectTrigger id="filter-fiat" className="h-10 md:h-9">
                  <SelectValue placeholder={t('rate.list.filter-fiat-ph')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rate.list.filter-all')}</SelectItem>
                  {tradeFiats.map((fiat) => (
                    <SelectItem key={fiat} value={fiat}>
                      {fiat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-crypto">
                {t('rate.list.filter-crypto')}
              </Label>
              <Select
                value={filters.crypto || 'all'}
                onValueChange={(v) => setFilter({ crypto: v === 'all' ? null : v })}
              >
                <SelectTrigger id="filter-crypto" className="h-10 md:h-9">
                  <SelectValue placeholder={t('rate.list.filter-crypto-ph')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rate.list.filter-all')}</SelectItem>
                  {tradeCryptos.map((crypto) => (
                    <SelectItem key={crypto} value={crypto}>
                      {crypto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-start">
                {t('rate.list.filter-start-at')}
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
                {t('rate.list.filter-end-at')}
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
              {t('rate.list.search')}
            </Button>
            <Button
              variant="outline"
              className="h-10 md:h-9"
              onClick={resetFilters}
              disabled={query.isFetching}
            >
              <RefreshCw className={query.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              {t('rate.list.reset')}
            </Button>
            <Button
              className="h-10 md:h-9"
              disabled={syncMutation.isPending}
              onClick={() => setSyncOpen(true)}
            >
              <RefreshCcw className={syncMutation.isPending ? 'size-4 animate-spin' : 'size-4'} />
              {t('rate.list.sync')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 列表（列与旧版 rate/list.vue 一致） */}
      <Card>
        <CardContent className="p-0 pb-4">
          {query.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rates.length === 0 ? (
            <EmptyState className="py-16" description={t('empty.title')} />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32 text-center">{t('rate.list.column-fiat')}</TableHead>
                      <TableHead className="w-28 text-center">{t('rate.list.column-crypto')}</TableHead>
                      <TableHead className="w-32 text-center">{t('rate.list.column-rate')}</TableHead>
                      <TableHead className="w-32 text-center">{t('rate.list.column-raw-rate')}</TableHead>
                      <TableHead className="min-w-44 text-center">{t('rate.list.column-created-at')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((rate: Rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="whitespace-nowrap text-center">
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden>{getFiatFlag(rate.fiat)}</span>
                            <span className="font-medium">{rate.fiat}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={cryptoBadgeVariant(rate.crypto)}>
                            {rate.crypto}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center font-medium">
                          {rate.rate}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center text-muted-foreground">
                          {rate.raw_rate}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center text-muted-foreground">
                          {formatDateTime(rate.created_at)}
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

      {/* 立刻同步确认框 */}
      <ConfirmDialog
        open={syncOpen}
        onOpenChange={(next) => {
          if (syncMutation.isPending) return
          setSyncOpen(next)
        }}
        title={t('rate.list.sync-title')}
        description={t('rate.list.sync-desc')}
        confirmText={t('rate.list.sync-confirm')}
        loading={syncMutation.isPending}
        onConfirm={() => syncMutation.mutate()}
      />
    </div>
  )
}
