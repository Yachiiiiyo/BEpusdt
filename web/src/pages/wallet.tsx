import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, RefreshCw, Search } from 'lucide-react'
import {
  addWallet,
  delWallet,
  fetchWalletList,
  modWallet,
  type Wallet,
} from '@/api/wallet'
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
import { Textarea } from '@/components/ui/textarea'
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
import { formatDateTime, truncateAddress } from '@/lib/format'
import { validateAddress } from '@/lib/wallet'
import { cn } from '@/lib/utils'

/** 钱包列表 query key 前缀，写操作成功后统一 invalidate */
const WALLET_LIST_KEY = 'wallet-list'

interface FilterState {
  name: string
  address: string
  tradeType: string
}

const EMPTY_FILTERS: FilterState = { name: '', address: '', tradeType: '' }

/* ---------------------------------- 表单 ---------------------------------- */

interface WalletFormValues {
  name: string
  address: string
  trade_type: string
  status: number
  other_notify: number
  remark: string
}

/** 新增/编辑对话框（react-hook-form + zod，地址校验按链类型） */
function WalletFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑中的钱包（null 表示新增） */
  editing: Wallet | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { tradeTypes } = useTradeMeta()

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(1, t('wallet.field-name-required')),
          address: z.string().min(1, t('wallet.field-address-required')),
          trade_type: z.string().min(1, t('wallet.field-trade-type-required')),
          status: z.number(),
          other_notify: z.number(),
          remark: z.string(),
        })
        .superRefine((values, ctx) => {
          if (!validateAddress(values.trade_type, values.address)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['address'],
              message: t('wallet.field-address-invalid'),
            })
          }
        }),
    [t],
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WalletFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      address: '',
      trade_type: '',
      status: 1,
      other_notify: 0,
      remark: '',
    },
  })

  // 打开时按模式初始化表单
  const onOpenChangeWrapper = (next: boolean) => {
    if (next) {
      reset({
        name: editing?.name ?? '',
        address: editing?.address ?? '',
        trade_type: editing?.trade_type ?? '',
        status: editing ? (editing.status === 1 ? 1 : 0) : 1,
        other_notify: editing?.other_notify === 1 ? 1 : 0,
        remark: editing?.remark ?? '',
      })
    }
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: async (values: WalletFormValues) => {
      if (editing) {
        await modWallet({
          id: editing.id,
          name: values.name,
          status: values.status,
          address: values.address,
          remark: values.remark,
          trade_type: values.trade_type,
          other_notify: values.other_notify,
        })
      } else {
        await addWallet({
          name: values.name,
          remark: values.remark,
          address: values.address,
          trade_type: values.trade_type,
          other_notify: values.other_notify,
        })
      }
    },
    onSuccess: () => {
      toast.success(t(editing ? 'wallet.mod-success' : 'wallet.add-success'))
      void queryClient.invalidateQueries({ queryKey: [WALLET_LIST_KEY] })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChangeWrapper}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(editing ? 'wallet.edit-title' : 'wallet.add-title')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t(editing ? 'wallet.edit-title' : 'wallet.add-title')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={handleSubmit((values) => mutation.mutateAsync(values).catch(() => {}))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="wallet-name">{t('wallet.field-name')}</Label>
            <Input
              id="wallet-name"
              placeholder={t('wallet.field-name-placeholder')}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive" role="alert">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="wallet-address">{t('wallet.field-address')}</Label>
            <Input
              id="wallet-address"
              className="font-mono text-[13px]"
              placeholder={t('wallet.field-address-placeholder')}
              {...register('address')}
            />
            {errors.address && (
              <p className="text-xs text-destructive" role="alert">
                {errors.address.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('wallet.field-trade-type')}</Label>
            <Controller
              control={control}
              name="trade_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-10 md:h-9">
                    <SelectValue placeholder={t('wallet.field-trade-type-placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {tradeTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.trade_type && (
              <p className="text-xs text-destructive" role="alert">
                {errors.trade_type.message}
              </p>
            )}
          </div>

          {editing && (
            <div className="flex flex-col gap-2">
              <Label>{t('wallet.field-status')}</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger className="h-10 md:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('wallet.status-enabled')}</SelectItem>
                      <SelectItem value="0">{t('wallet.status-disabled')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>{t('wallet.field-other-notify')}</Label>
            <Controller
              control={control}
              name="other_notify"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger className="h-10 md:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('wallet.notify-off')}</SelectItem>
                    <SelectItem value="1">{t('wallet.notify-on')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-destructive">{t('wallet.other-notify-hint')}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="wallet-remark">{t('wallet.field-remark')}</Label>
            <Textarea
              id="wallet-remark"
              placeholder={t('wallet.field-remark-placeholder')}
              {...register('remark')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10 md:h-9"
              disabled={isSubmitting}
              onClick={() => onOpenChangeWrapper(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="h-10 md:h-9" disabled={isSubmitting}>
              {isSubmitting ? '' : t('wallet.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- 详情 ---------------------------------- */

function WalletDetailDialog({
  wallet,
  onOpenChange,
}: {
  wallet: Wallet | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  const rows: { label: string; value: React.ReactNode }[] = wallet
    ? [
        { label: t('wallet.detail-id'), value: String(wallet.id) },
        { label: t('wallet.detail-name'), value: wallet.name },
        {
          label: t('wallet.detail-address'),
          value: (
            <span className="flex items-center gap-1 font-mono text-[13px] break-all">
              {wallet.address}
              <CopyButton text={wallet.address} />
            </span>
          ),
        },
        { label: t('wallet.detail-trade-type'), value: <Badge variant="secondary">{wallet.trade_type}</Badge> },
        {
          label: t('wallet.column-status'),
          value: (
            <Badge variant={wallet.status === 1 ? 'success' : 'destructive'}>
              {t(wallet.status === 1 ? 'wallet.detail-status-enabled' : 'wallet.detail-status-disabled')}
            </Badge>
          ),
        },
        {
          label: t('wallet.detail-notify'),
          value: (
            <Badge variant={wallet.other_notify === 1 ? 'default' : 'secondary'}>
              {t(wallet.other_notify === 1 ? 'wallet.detail-notify-on' : 'wallet.detail-notify-off')}
            </Badge>
          ),
        },
        ...(wallet.remark
          ? [{ label: t('wallet.detail-remark'), value: <span className="whitespace-pre-wrap">{wallet.remark}</span> }]
          : []),
        ...(wallet.created_at
          ? [{ label: t('wallet.detail-created-at'), value: formatDateTime(wallet.created_at) }]
          : []),
        ...(wallet.updated_at
          ? [{ label: t('wallet.detail-updated-at'), value: formatDateTime(wallet.updated_at) }]
          : []),
      ]
    : []

  return (
    <Dialog open={wallet !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('wallet.detail-title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('wallet.detail-title')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <span className="w-32 shrink-0 text-sm text-muted-foreground">{row.label}</span>
              <span className="min-w-0 text-sm font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- 页面 ---------------------------------- */

export default function WalletPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { tradeTypes } = useTradeMeta()

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const [detail, setDetail] = useState<Wallet | null>(null)
  const [deleting, setDeleting] = useState<Wallet | null>(null)

  const query = useQuery({
    queryKey: [WALLET_LIST_KEY, filters, page, size],
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchWalletList({
        page,
        size,
        // 对齐旧版：固定按 id 倒序
        sort: 'desc',
        keyword: '',
        name: filters.name || undefined,
        address: filters.address || undefined,
        trade_type: filters.tradeType || undefined,
      }),
  })

  const wallets = query.data?.data ?? []
  const total = query.data?.total ?? 0

  const deleteMutation = useMutation({
    mutationFn: (id: number) => delWallet(id),
    onSuccess: () => {
      toast.success(t('wallet.delete-success'))
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: [WALLET_LIST_KEY] })
    },
  })

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('wallet.title')}</h1>

      {/* 筛选表单 */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-name">
                {t('wallet.filter-name')}
              </Label>
              <Input
                id="filter-name"
                className="h-10 md:h-9"
                placeholder={t('wallet.filter-name-placeholder')}
                value={filters.name}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, name: e.target.value }))
                  setPage(1)
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="filter-address">
                {t('wallet.filter-address')}
              </Label>
              <Input
                id="filter-address"
                className="h-10 md:h-9"
                placeholder={t('wallet.filter-address-placeholder')}
                value={filters.address}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, address: e.target.value }))
                  setPage(1)
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t('wallet.filter-trade-type')}
              </Label>
              <Select
                value={filters.tradeType || undefined}
                onValueChange={(v) => {
                  setFilters((f) => ({ ...f, tradeType: v }))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-10 md:h-9">
                  <SelectValue placeholder={t('wallet.filter-trade-type-placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {tradeTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-10 md:h-9"
              onClick={() => {
                setPage(1)
                void query.refetch()
              }}
              disabled={query.isFetching}
            >
              <Search className="size-4" />
              {t('wallet.search')}
            </Button>
            <Button
              variant="outline"
              className="h-10 md:h-9"
              onClick={resetFilters}
              disabled={query.isFetching}
            >
              <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
              {t('wallet.reset')}
            </Button>
            <Button
              className="h-10 bg-emerald-600 text-white hover:bg-emerald-700 md:h-9"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" />
              {t('wallet.add')}
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
          ) : wallets.length === 0 ? (
            <EmptyState className="py-16" description={t('empty.title')} />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">{t('wallet.column-id')}</TableHead>
                    <TableHead className="min-w-32 text-center">{t('wallet.column-name')}</TableHead>
                    <TableHead className="min-w-28 text-center">{t('wallet.column-trade-type')}</TableHead>
                    <TableHead className="min-w-64 text-center">{t('wallet.column-address')}</TableHead>
                    <TableHead className="w-24 text-center">{t('wallet.column-status')}</TableHead>
                    <TableHead className="w-24 text-center">{t('wallet.column-other-notify')}</TableHead>
                    <TableHead className="w-px whitespace-nowrap text-center">{t('wallet.column-actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((wallet) => (
                    <TableRow key={wallet.id}>
                      <TableCell className="text-center text-muted-foreground">{wallet.id}</TableCell>
                      <TableCell className="max-w-48 truncate text-center" title={wallet.name}>
                        {wallet.name}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{wallet.trade_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center justify-center gap-1">
                          <span
                            className="font-mono text-[12px] break-all"
                            title={wallet.address}
                          >
                            {truncateAddress(wallet.address, 10, 6)}
                          </span>
                          <CopyButton text={wallet.address} />
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={wallet.status === 1 ? 'success' : 'destructive'}>
                          {t(wallet.status === 1 ? 'wallet.status-enabled' : 'wallet.status-disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={wallet.other_notify === 1 ? 'default' : 'secondary'}>
                          {t(wallet.other_notify === 1 ? 'wallet.notify-on' : 'wallet.notify-off')}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-px whitespace-nowrap">
                        <div className="flex flex-nowrap items-center justify-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setDetail(wallet)}
                          >
                            {t('wallet.action-detail')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setEditing(wallet)
                              setFormOpen(true)
                            }}
                          >
                            {t('wallet.action-edit')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8"
                            onClick={() => setDeleting(wallet)}
                          >
                            {t('wallet.action-delete')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {total > 0 && (
            <div className="px-4 pt-4">
              <Pagination
                page={page}
                size={size}
                total={total}
                onPageChange={setPage}
                onSizeChange={(s) => {
                  setSize(s)
                  setPage(1)
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增 / 编辑 */}
      <WalletFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />

      {/* 详情 */}
      <WalletDetailDialog wallet={detail} onOpenChange={() => setDetail(null)} />

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title={t('wallet.delete-confirm-title')}
        description={
          deleting ? (
            <>
              {t('wallet.delete-confirm-description')}
              <br />
              <span className="font-mono text-[13px]">
                {deleting.name ? `${deleting.name} · ` : ''}
                {truncateAddress(deleting.address, 10, 6)}
              </span>
            </>
          ) : undefined
        }
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id)
        }}
      />
    </div>
  )
}
