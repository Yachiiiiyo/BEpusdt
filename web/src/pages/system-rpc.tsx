import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  Layers,
  Link2,
  MinusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Clock,
} from 'lucide-react'
import { fetchConfRpc, setConfs, type ConfSetReq } from '@/api/conf'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  CONFIG_URL_SCHEMES,
  RPC_FIELDS,
  RPC_URL_SCHEMES,
  STAT_NETWORKS,
  TRON_GRID_API_KEY,
  buildRpcSaveItems,
  formatBlockHeight,
  formatStatTime,
  parseStats,
  sortStatNetworks,
  successRateLevel,
  validateUrl,
  type RpcStat,
} from '@/lib/rpc'
import { cn } from '@/lib/utils'

const RPC_QUERY_KEY = 'system-rpc-conf'

type RpcForm = Record<string, string>

const EMPTY_FORM: RpcForm = {}

/** 从 GET /api/conf/rpc 的 rpc 初始化表单（旧版 getConf） */
function initRpcForm(rpc: Record<string, string> | undefined): RpcForm {
  const map = rpc ?? {}
  const form: RpcForm = {}
  for (const field of RPC_FIELDS) form[field.key] = map[field.key] ?? ''
  form[TRON_GRID_API_KEY] = map[TRON_GRID_API_KEY] ?? ''
  return form
}

/* --------------------------------- 状态总览 --------------------------------- */

/** 成功率分级配色（沿用旧版阈值与色值） */
const SUCC_CLASS: Record<string, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-orange-600 dark:text-orange-400',
  bad: 'text-red-600 dark:text-red-400',
}

const DOT_CLASS: Record<string, string> = {
  good: 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]',
  warn: 'bg-orange-500 shadow-[0_0_0_2px_rgba(249,115,22,0.2)]',
  bad: 'bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.2)]',
  unknown: 'bg-muted-foreground/40',
}

function StatsSection({ stats }: { stats: Record<string, RpcStat> }) {
  const { t } = useTranslation()
  const sorted = useMemo(() => sortStatNetworks(STAT_NETWORKS, stats), [stats])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{t('systemRpc.stats-title')}</span>
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <RefreshCw className="size-3 animate-spin" />
            {t('systemRpc.live')}
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sorted.map((net) => {
            const stat = stats[net.statKey]
            const level = stat ? successRateLevel(stat.succ) : 'unknown'
            return (
              <div
                key={net.key}
                className="relative overflow-hidden rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded text-white"
                    style={{ background: net.color }}
                  >
                    {net.statKey === 'tron' ? (
                      <Flame className="size-3.5" />
                    ) : (
                      <Link2 className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {t(net.netKey)}
                  </span>
                  <span className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[level])} />
                </div>

                <div className="mt-2.5 flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                      <CheckCircle2 className="size-3 text-emerald-500" />
                      {t('systemRpc.stats-succ-rate')}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 truncate font-semibold',
                        stat ? SUCC_CLASS[successRateLevel(stat.succ)] : 'text-muted-foreground',
                      )}
                    >
                      {stat?.succ || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                      <Layers className="size-3 text-primary" />
                      {t('systemRpc.stats-block')}
                    </span>
                    <span
                      className="min-w-0 truncate font-mono font-medium text-primary"
                      title={stat?.block}
                    >
                      {stat?.block ? formatBlockHeight(stat.block) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                      <Clock className="size-3" />
                      {t('systemRpc.stats-last-sync')}
                    </span>
                    <span
                      className="min-w-0 truncate text-muted-foreground"
                      title={formatStatTime(stat?.time)}
                    >
                      {formatStatTime(stat?.time)}
                    </span>
                  </div>
                </div>

                {!stat && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-background/85 text-[11px] text-muted-foreground">
                    <MinusCircle className="size-4" />
                    <span>{t('systemRpc.stats-no-data')}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/* --------------------------------- 配置表单 --------------------------------- */

/** 表单字段：label + 控件 + 错误文案 */
function Field({
  label,
  htmlFor,
  error,
  extra,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  error?: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : extra ? (
        <p className="text-xs break-words text-muted-foreground">{extra}</p>
      ) : null}
    </div>
  )
}

function ConfigSection({
  form,
  initial,
  onChange,
  onSaved,
}: {
  form: RpcForm
  initial: RpcForm
  onChange: (key: string, value: string) => void
  /** 保存成功：表单与 baseline 同步为已保存的值 */
  onSaved: (items: ConfSetReq[]) => void
}) {
  const { t } = useTranslation()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showTronKey, setShowTronKey] = useState(false)
  const queryClient = useQueryClient()

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  const mutation = useMutation({
    mutationFn: (items: ConfSetReq[]) => setConfs(items),
    onSuccess: (_data, items) => {
      toast.success(t('systemRpc.save-success'))
      setConfirmOpen(false)
      // 同步表单为已保存值（旧版保存成功后 getConf() 重置表单），并刷新统计
      onSaved(items)
      void queryClient.invalidateQueries({ queryKey: [RPC_QUERY_KEY] })
    },
    onError: () => setConfirmOpen(false),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    for (const field of RPC_FIELDS) {
      const value = form[field.key] ?? ''
      const code = validateUrl(
        value,
        field.key === 'rpc_global_config_url_ton' ? CONFIG_URL_SCHEMES : RPC_URL_SCHEMES,
      )
      if (code === 'required') err[field.key] = t('systemRpc.error-required', { field: t(field.labelKey) })
      else if (code === 'scheme') err[field.key] = t('systemRpc.error-scheme', { field: t(field.labelKey) })
    }
    setErrors(err)
    if (Object.keys(err).length > 0) {
      toast.error(t('systemRpc.error-form'))
      return
    }
    setConfirmOpen(true)
  }

  const handleReset = () => {
    // 还原为上次加载/保存的值（旧版 handleReset）
    for (const field of RPC_FIELDS) onChange(field.key, initial[field.key] ?? '')
    onChange(TRON_GRID_API_KEY, initial[TRON_GRID_API_KEY] ?? '')
    toast.info(t('systemRpc.reset-done'))
  }

  const handleConfirm = () => {
    const { items } = buildRpcSaveItems(form)
    mutation.mutate(items)
  }

  const tronField = RPC_FIELDS.find((f) => f.key === 'rpc_endpoint_tron')!
  const otherFields = RPC_FIELDS.filter(
    (f) => f.key !== 'rpc_endpoint_tron' && f.key !== 'rpc_global_config_url_ton',
  )
  const tonField = RPC_FIELDS.find((f) => f.key === 'rpc_global_config_url_ton')!

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{t('systemRpc.conf-title')}</span>
            <a
              className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
              href="https://github.com/Yachiiiiyo/BEpusdt/blob/main/docs/faq/rpc-endpoint.md"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen className="size-3" />
              {t('systemRpc.doc-link')}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 md:h-9"
              disabled={!dirty}
              onClick={handleReset}
            >
              <RotateCcw className="size-4" />
              {t('systemRpc.reset')}
            </Button>
            <Button
              type="submit"
              form="system-rpc-form"
              className="h-10 md:h-9"
              disabled={!dirty || mutation.isPending}
            >
              <Save className="size-4" />
              {mutation.isPending ? t('systemRpc.saving') : t('systemRpc.save')}
            </Button>
          </div>
        </div>

        <form id="system-rpc-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* Tron 网络 */}
          <section className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
              <span className="inline-flex size-5 items-center justify-center rounded bg-red-500 text-white">
                <Flame className="size-3" />
              </span>
              <span className="text-sm font-semibold">{t('systemRpc.tron-section')}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label={t(tronField.labelKey)}
                htmlFor="rpc-tron"
                error={errors[tronField.key]}
              >
                <Input
                  id="rpc-tron"
                  className="h-10 md:h-9"
                  value={form[tronField.key] ?? ''}
                  placeholder={t('systemRpc.endpoint-ph', { field: t(tronField.labelKey) })}
                  onChange={(e) => onChange(tronField.key, e.target.value)}
                />
              </Field>
              <Field
                label={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>{t('systemRpc.tron-grid-api-key')}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={t('systemRpc.tron-grid-api-key-tip')}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <span className="inline-flex size-4 items-center justify-center rounded-full border border-current text-[10px]">
                              ?
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">
                          {t('systemRpc.tron-grid-api-key-tip')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Badge variant="warning" className="text-[10px]">
                      {t('systemRpc.recommend')}
                    </Badge>
                  </span>
                }
                htmlFor="rpc-tron-grid-key"
              >
                <div className="flex items-center gap-1.5">
                  <Input
                    id="rpc-tron-grid-key"
                    type={showTronKey ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 flex-1 font-mono text-sm md:h-9"
                    value={form[TRON_GRID_API_KEY] ?? ''}
                    placeholder={t('systemRpc.tron-grid-api-key-ph')}
                    onChange={(e) => onChange(TRON_GRID_API_KEY, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-10 shrink-0 text-foreground md:size-9"
                    aria-label={showTronKey ? t('systemRpc.hide-key') : t('systemRpc.show-key')}
                    title={showTronKey ? t('systemRpc.hide-key') : t('systemRpc.show-key')}
                    onClick={() => setShowTronKey((v) => !v)}
                  >
                    {showTronKey ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </Button>
                </div>
              </Field>
            </div>
          </section>

          {/* 其他网络 */}
          <section className="rounded-lg border border-border p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
              <span className="inline-flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
                <Link2 className="size-3" />
              </span>
              <span className="text-sm font-semibold">{t('systemRpc.other-section')}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {otherFields.map((field) => (
                <Field
                  key={field.key}
                  label={t(field.labelKey)}
                  htmlFor={`rpc-${field.key}`}
                  error={errors[field.key]}
                >
                  <Input
                    id={`rpc-${field.key}`}
                    className="h-10 md:h-9"
                    value={form[field.key] ?? ''}
                    placeholder={t('systemRpc.endpoint-ph', { field: t(field.labelKey) })}
                    onChange={(e) => onChange(field.key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </section>

          {/* TON Global Config URL 单独一项 */}
          <section className="rounded-lg border border-border p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
              <span className="inline-flex size-5 items-center justify-center rounded bg-[#0088cc] text-white">
                <Link2 className="size-3" />
              </span>
              <span className="text-sm font-semibold">{t('systemRpc.ton-section')}</span>
            </div>
            <Field
              label={t(tonField.labelKey)}
              htmlFor="rpc-ton-config"
              error={errors[tonField.key]}
              extra={t('systemRpc.ton-config-extra')}
            >
              <Input
                id="rpc-ton-config"
                className="h-10 md:h-9"
                value={form[tonField.key] ?? ''}
                placeholder={t('systemRpc.endpoint-ph', { field: t(tonField.labelKey) })}
                onChange={(e) => onChange(tonField.key, e.target.value)}
              />
            </Field>
          </section>

          {dirty && (
            <p className="text-xs text-muted-foreground">{t('systemRpc.unsaved')}</p>
          )}
        </form>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={(next) => {
            if (mutation.isPending) return
            setConfirmOpen(next)
          }}
          title={t('systemRpc.save-title')}
          description={t('systemRpc.save-desc')}
          confirmText={t('systemRpc.save')}
          loading={mutation.isPending}
          onConfirm={handleConfirm}
        />
      </CardContent>
    </Card>
  )
}

/* ----------------------------------- 页面 ----------------------------------- */

export default function SystemRpcPage() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: [RPC_QUERY_KEY],
    queryFn: () => fetchConfRpc(),
    // 旧版每 3 秒刷新一次状态总览
    refetchInterval: 3000,
  })

  const stats = useMemo(() => parseStats(query.data?.stats), [query.data])

  // 表单只在首次加载或保存后同步（旧版 handleRefreshStats 不会重置表单）
  const [form, setForm] = useState<RpcForm | null>(null)
  const [initial, setInitial] = useState<RpcForm>(EMPTY_FORM)

  useEffect(() => {
    if (query.data && form === null) {
      const next = initRpcForm(query.data.rpc)
      setForm(next)
      setInitial(next)
    }
  }, [query.data, form])

  const handleChange = (key: string, value: string) => {
    setForm((prev) => (prev === null ? prev : { ...prev, [key]: value }))
  }

  const handleSaved = (items: ConfSetReq[]) => {
    const next: RpcForm = {}
    for (const item of items) next[item.key] = item.value
    setForm(next)
    setInitial(next)
  }

  const loading = query.isLoading

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('systemRpc.title')}</h1>

      {loading ? (
        <Card>
          <CardContent className="grid gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, idx) => (
              <Skeleton key={idx} className="h-28 rounded-lg" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <StatsSection stats={stats} />
      )}

      {loading || form === null ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </CardContent>
        </Card>
      ) : (
        <ConfigSection form={form} initial={initial} onChange={handleChange} onSaved={handleSaved} />
      )}
    </div>
  )
}
