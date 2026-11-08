import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Info, Pencil, Settings2 } from 'lucide-react'
import { fetchRateSyntax, setRateSyntax, type RateSyntax } from '@/api/rate'
import { getConfs, setConfs, type ConfSetReq } from '@/api/conf'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { useTradeMeta } from '@/hooks/use-trade-meta'
import { getFiatFlag } from '@/lib/rate'
import { cryptoBadgeVariant } from '@/lib/order'
import { cn } from '@/lib/utils'
import {
  ATOM_KEYS,
  CUSTOM_API_URL_PRESET,
  type AtomFormState,
  type AtomKey,
  type SyntaxDescription,
  type SyntaxType,
  type SyncFormState,
  atomFormFromConf,
  buildAtomConfItems,
  buildSyncConfItems,
  defaultAtomForm,
  defaultSyncForm,
  defaultSyntaxValueOnTypeChange,
  describeFormSyntax,
  describeSyntax,
  formatValue,
  generateSyntax,
  parseSyntax,
  secondsToMinutes,
  syncFormFromApiUrl,
  validateSyncForm,
  validateSyntax,
} from '@/lib/rate-syntax'

const SYNTAX_LIST_KEY = 'rate-syntax-list'

/** 汇率语法单选项（id 为 UI 唯一值，toSyntaxType 转田旧版 radio 的值） */
const SYNTAX_TYPE_OPTIONS: {
  id: string
  type: SyntaxType
  labelKey: string
}[] = [
  { id: 'market', type: 'market', labelKey: 'rate.syntax.rule-market' },
  { id: 'fixed-value', type: '', labelKey: 'rate.syntax.rule-fixed-value' },
  { id: 'fixed-float', type: 'fixed', labelKey: 'rate.syntax.rule-fixed-float' },
  { id: 'ratio', type: '~', labelKey: 'rate.syntax.rule-ratio' },
]

function syntaxTypeToId(type: SyntaxType): string {
  return SYNTAX_TYPE_OPTIONS.find((o) => o.type === type)?.id ?? 'market'
}

/* ------------------------------ 语法描述文案 ------------------------------ */

/** 表格里的语法描述（旧版 getTableSyntaxDescription） */
function renderTableDescription(
  t: (k: string, opt?: Record<string, unknown>) => string,
  desc: SyntaxDescription | null,
): string {
  if (desc === null) return ''
  switch (desc.mode) {
    case 'market':
      return t('rate.syntax.desc-market')
    case 'fixed-float': {
      if (desc.value === undefined) return ''
      const num = parseFloat(desc.value)
      if (num > 0) return t('rate.syntax.desc-fixed-float-pos', { value: desc.value })
      if (num < 0) {
        return t('rate.syntax.desc-fixed-float-neg', {
          value: formatValue(Math.abs(num)),
        })
      }
      return t('rate.syntax.desc-fixed-float-zero')
    }
    case 'ratio':
      if (desc.value === undefined) return ''
      if (desc.value !== '1') {
        return t('rate.syntax.desc-ratio', { value: desc.value })
      }
      return t('rate.syntax.desc-fixed-float-zero')
    default:
      if (desc.value === undefined) return ''
      return t('rate.syntax.desc-fixed-value', { value: desc.value })
  }
}

/** 编辑表单里的实时描述（旧版 getFormSyntaxDescription） */
function renderFormDescription(
  t: (k: string, opt?: Record<string, unknown>) => string,
  desc: SyntaxDescription,
): string {
  switch (desc.mode) {
    case 'market':
      return t('rate.syntax.form-desc-market')
    case 'fixed-float':
      if (desc.value === undefined) {
        return t('rate.syntax.form-desc-fixed-float-novalue')
      }
      {
        const num = parseFloat(desc.value)
        if (num > 0) {
          return t('rate.syntax.form-desc-fixed-float-pos', { value: desc.value })
        }
        if (num < 0) {
          return t('rate.syntax.form-desc-fixed-float-neg', {
            value: formatValue(Math.abs(num)),
          })
        }
        return t('rate.syntax.form-desc-fixed-float-zero')
      }
    case 'ratio':
      if (desc.value === undefined) return t('rate.syntax.form-desc-ratio-novalue')
      if (desc.value !== '1') {
        return t('rate.syntax.form-desc-ratio', { value: desc.value })
      }
      return t('rate.syntax.form-desc-fixed-float-zero')
    default:
      if (desc.value === undefined) {
        return t('rate.syntax.form-desc-fixed-value-novalue')
      }
      return t('rate.syntax.form-desc-fixed-value', { value: desc.value })
  }
}

/* --------------------------------- 编辑弹窗 --------------------------------- */

function EditSyntaxDialog({
  record,
  onOpenChange,
}: {
  record: RateSyntax | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [type, setType] = useState<SyntaxType>('')
  /** 数值输入框原始内容，空串表示未填写 */
  const [valueText, setValueText] = useState('')

  useEffect(() => {
    if (record) {
      const parsed = parseSyntax(record.syntax)
      setType(parsed.type)
      setValueText(parsed.value === undefined || Number.isNaN(parsed.value) ? '' : String(parsed.value))
    }
  }, [record])

  const value = useMemo(() => {
    const v = valueText.trim()
    if (v === '') return undefined
    const n = Number(v)
    return Number.isNaN(n) ? undefined : n
  }, [valueText])

  const error = validateSyntax(type, value)
  const formDesc = describeFormSyntax(type, value)

  const mutation = useMutation({
    mutationFn: (input: { fiat: string; crypto: string; syntax: string }) =>
      setRateSyntax(input),
    onSuccess: (_d, variables) => {
      toast.success(
        t('rate.syntax.save-success', {
          fiat: variables.fiat,
          crypto: variables.crypto,
        }),
      )
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: [SYNTAX_LIST_KEY] })
    },
    // 失败时 client.ts 统一 toast 后端 msg
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!record) return
    if (!record.fiat || !record.crypto) {
      toast.error(t('rate.syntax.error-incomplete'))
      return
    }
    if (error) {
      toast.error(t(`rate.syntax.error-${error}`))
      return
    }
    mutation.mutate({
      fiat: record.fiat,
      crypto: record.crypto,
      syntax: generateSyntax(type, value),
    })
  }

  const placeholderKey =
    type === 'fixed'
      ? 'rate.syntax.value-ph-fixed-float'
      : type === '~'
        ? 'rate.syntax.value-ph-ratio'
        : type === ''
          ? 'rate.syntax.value-ph-fixed-value'
          : ''

  return (
    <Dialog
      open={record !== null}
      onOpenChange={(next) => {
        if (mutation.isPending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rate.syntax.edit-title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('rate.syntax.edit-title')}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-fiat">{t('rate.syntax.edit-fiat')}</Label>
              <Input
                id="edit-fiat"
                readOnly
                value={record ? `${getFiatFlag(record.fiat)} ${record.fiat}` : ''}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('rate.syntax.edit-crypto')}</Label>
              <div>
                {record && (
                  <Badge variant={cryptoBadgeVariant(record.crypto)}>
                    {record.crypto}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('rate.syntax.rule')}</Label>
            <RadioGroup
              value={syntaxTypeToId(type)}
              onValueChange={(id) => {
                const opt = SYNTAX_TYPE_OPTIONS.find((o) => o.id === id)
                if (!opt) return
                const next = opt.type
                const nextValue = defaultSyntaxValueOnTypeChange(next, value)
                setType(next)
                setValueText(
                  nextValue === undefined || nextValue === null
                    ? ''
                    : String(nextValue),
                )
              }}
              className="gap-2"
            >
              {SYNTAX_TYPE_OPTIONS.map((opt) => (
                <Label
                  key={opt.id}
                  htmlFor={`syntax-type-${opt.id}`}
                  className="flex min-h-10 items-center gap-2 rounded-md border border-border px-3 font-normal has-data-[state=checked]:border-primary"
                >
                  <RadioGroupItem id={`syntax-type-${opt.id}`} value={opt.id} />
                  {t(opt.labelKey)}
                </Label>
              ))}
            </RadioGroup>
          </div>

          {type !== 'market' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-value">{t('rate.syntax.value')}</Label>
              <div className="flex items-center gap-2">
                {type && type !== 'fixed' && (
                  <span className="font-mono font-bold text-primary">{type}</span>
                )}
                <Input
                  id="edit-value"
                  className="h-10 md:h-9 font-mono"
                  inputMode="decimal"
                  placeholder={placeholderKey ? t(placeholderKey) : ''}
                  value={valueText}
                  onChange={(e) => setValueText(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {t(`rate.syntax.error-${error}`)}
                </p>
              )}
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {renderFormDescription(t, formDesc)}
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
            <Button type="submit" className="h-10 md:h-9" disabled={mutation.isPending}>
              {t('rate.syntax.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------- 同步配置弹窗 -------------------------------- */

const SYNC_CONF_KEYS = [
  'rate_sync_interval',
  'rate_sync_coingecko_api_url',
  'rate_sync_coingecko_api_key',
  'rate_sync_history_days',
]

function SyncConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<SyncFormState>(defaultSyncForm)
  const [error, setError] = useState<string | null>(null)
  const [loadingConf, setLoadingConf] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    setLoadingConf(true)
    getConfs(SYNC_CONF_KEYS)
      .then((conf) => {
        if (cancelled) return
        let next = defaultSyncForm()
        next.minutes = secondsToMinutes(conf.rate_sync_interval)
        next = syncFormFromApiUrl(next, conf.rate_sync_coingecko_api_url)
        next.apiKey = conf.rate_sync_coingecko_api_key || ''
        next.historyDays = conf.rate_sync_history_days
          ? parseInt(conf.rate_sync_history_days, 10) || 30
          : 30
        setForm(next)
      })
      .catch(() => {
        if (cancelled) return
        setForm(defaultSyncForm())
        toast.warning(t('rate.syntax.load-defaults-failed'))
      })
      .finally(() => {
        if (!cancelled) setLoadingConf(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, t])

  const mutation = useMutation({
    mutationFn: (items: ConfSetReq[]) => setConfs(items),
    onSuccess: () => {
      toast.success(t('rate.syntax.sync-success'))
      onOpenChange(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateSyncForm(form)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    mutation.mutate(buildSyncConfItems(form))
  }

  const errorText = error ? t(`rate.syntax.sync-error-${error}`) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rate.syntax.sync-title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('rate.syntax.sync-title')}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sync-minutes">{t('rate.syntax.sync-minutes')}</Label>
            <Input
              id="sync-minutes"
              className="h-10 md:h-9"
              inputMode="numeric"
              disabled={loadingConf}
              value={form.minutes}
              onChange={(e) =>
                setForm({ ...form, minutes: Number(e.target.value) || 0 })
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('rate.syntax.sync-api')}</Label>
            <Select
              value={form.apiUrlPreset}
              onValueChange={(v) => setForm({ ...form, apiUrlPreset: v })}
            >
              <SelectTrigger className="h-10 md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="https://api.coingecko.com">
                  {t('rate.syntax.sync-api-official')}
                </SelectItem>
                <SelectItem value="https://api.bepusdt.online">
                  {t('rate.syntax.sync-api-author')}
                </SelectItem>
                <SelectItem value={CUSTOM_API_URL_PRESET}>
                  {t('rate.syntax.sync-api-custom')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.apiUrlPreset === CUSTOM_API_URL_PRESET && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="sync-custom-url">
                {t('rate.syntax.sync-custom-url')}
              </Label>
              <Input
                id="sync-custom-url"
                className="h-10 md:h-9"
                placeholder={t('rate.syntax.sync-custom-url-ph')}
                value={form.customApiUrl}
                onChange={(e) => setForm({ ...form, customApiUrl: e.target.value })}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="sync-api-key">{t('rate.syntax.sync-api-key')}</Label>
            <Input
              id="sync-api-key"
              className="h-10 md:h-9"
              placeholder={t('rate.syntax.sync-api-key-ph')}
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sync-history-days">
              {t('rate.syntax.sync-history-days')}
            </Label>
            <Input
              id="sync-history-days"
              className="h-10 md:h-9"
              inputMode="numeric"
              value={form.historyDays}
              onChange={(e) =>
                setForm({ ...form, historyDays: Number(e.target.value) || 0 })
              }
            />
          </div>

          {errorText && (
            <p role="alert" className="text-sm text-destructive">
              {errorText}
            </p>
          )}

          <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <p>{t('rate.syntax.sync-tip-interval')}</p>
            <p>{t('rate.syntax.sync-tip-official')}</p>
            <p>{t('rate.syntax.sync-tip-author')}</p>
            <p>{t('rate.syntax.sync-tip-custom')}</p>
            <p className="mt-1 border-t border-border pt-1 font-medium text-primary">
              {t('rate.syntax.sync-tip-warning')}
            </p>
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
              type="submit"
              className="h-10 md:h-9"
              disabled={mutation.isPending || loadingConf}
            >
              {t('rate.syntax.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- 支付颗粒度弹窗 ------------------------------- */

const ATOM_FIELDS: { key: AtomKey; labelKey: string; placeholder: string }[] = [
  { key: 'atom_usdt', labelKey: 'rate.syntax.atom-usdt', placeholder: '0.01' },
  { key: 'atom_usdc', labelKey: 'rate.syntax.atom-usdc', placeholder: '0.01' },
  { key: 'atom_trx', labelKey: 'rate.syntax.atom-trx', placeholder: '0.01' },
  { key: 'atom_bnb', labelKey: 'rate.syntax.atom-bnb', placeholder: '0.00001' },
  { key: 'atom_eth', labelKey: 'rate.syntax.atom-eth', placeholder: '0.000001' },
  { key: 'atom_gram', labelKey: 'rate.syntax.atom-gram', placeholder: '0.01' },
]

function AtomConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  /** 输入框以字符串保存（避免 number 精度/step 损耗） */
  const [atomText, setAtomText] = useState<Record<string, string>>(() =>
    atomFormToStrings(defaultAtomForm()),
  )
  const [error, setError] = useState(false)
  const [loadingConf, setLoadingConf] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(false)
    setLoadingConf(true)
    getConfs([...ATOM_KEYS])
      .then((conf) => {
        if (cancelled) return
        setAtomText(atomFormToStrings(atomFormFromConf(conf)))
      })
      .catch(() => {
        if (cancelled) return
        setAtomText(atomFormToStrings(defaultAtomForm()))
        toast.warning(t('rate.syntax.load-defaults-failed'))
      })
      .finally(() => {
        if (!cancelled) setLoadingConf(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, t])

  const mutation = useMutation({
    mutationFn: (items: ConfSetReq[]) => setConfs(items),
    onSuccess: () => {
      toast.success(t('rate.syntax.atom-success'))
      onOpenChange(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const next = atomFormFromStrings(atomText)
    const invalid = ATOM_KEYS.some((key) => {
      const field = key.replace('atom_', '') as keyof AtomFormState
      return !next[field]
    })
    if (invalid) {
      setError(true)
      return
    }
    setError(false)
    mutation.mutate(buildAtomConfItems(next))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rate.syntax.atom-title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('rate.syntax.atom-title')}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ATOM_FIELDS.map((field) => {
              const name = field.key.replace('atom_', '') as keyof AtomFormState
              return (
                <div key={field.key} className="flex flex-col gap-2">
                  <Label htmlFor={`atom-${name}`}>{t(field.labelKey)}</Label>
                  <Input
                    id={`atom-${name}`}
                    className="h-10 md:h-9 font-mono"
                    inputMode="decimal"
                    placeholder={field.placeholder}
                    value={atomText[name] ?? ''}
                    onChange={(e) =>
                      setAtomText({ ...atomText, [name]: e.target.value })
                    }
                  />
                </div>
              )
            })}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t('rate.syntax.atom-error-required')}
            </p>
          )}

          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t('rate.syntax.atom-tip')}
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
              type="submit"
              className="h-10 md:h-9"
              disabled={mutation.isPending || loadingConf}
            >
              {t('rate.syntax.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- 主页面 ---------------------------------- */

export default function RateSyntaxPage() {
  const { t } = useTranslation()
  const { tradeFiats, tradeCryptos } = useTradeMeta()
  const [filterFiat, setFilterFiat] = useState('all')
  const [filterCrypto, setFilterCrypto] = useState('all')
  const [helpOpen, setHelpOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<RateSyntax | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [atomOpen, setAtomOpen] = useState(false)

  const query = useQuery({
    queryKey: [SYNTAX_LIST_KEY],
    queryFn: () => fetchRateSyntax(),
  })

  const list = query.data ?? []
  const filtered = list.filter(
    (row) =>
      (filterFiat === 'all' || row.fiat === filterFiat) &&
      (filterCrypto === 'all' || row.crypto === filterCrypto),
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('rate.syntax.title')}</h1>

      {/* 语法说明（可折叠帮助面板） */}
      <Card>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Info className="size-4 text-primary" />
            {t('rate.syntax.help-title')}
          </span>
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              helpOpen && 'rotate-180',
            )}
          />
        </button>
        {helpOpen && (
          <CardContent className="flex flex-col gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <p>{t('rate.syntax.help-market')}</p>
            <p>{t('rate.syntax.help-fixed-value')}</p>
            <p>{t('rate.syntax.help-fixed-float')}</p>
            <p>{t('rate.syntax.help-ratio')}</p>
          </CardContent>
        )}
      </Card>

      {/* 工具栏：筛选 + 同步配置 + 支付颗粒度 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:w-auto">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="syntax-filter-fiat">
              {t('rate.syntax.filter-fiat')}
            </Label>
            <Select value={filterFiat} onValueChange={setFilterFiat}>
              <SelectTrigger id="syntax-filter-fiat" className="h-10 md:h-9 md:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('rate.list.filter-all')}</SelectItem>
                {(tradeFiats.length > 0 ? tradeFiats : unique(list.map((r) => r.fiat))).map(
                  (fiat) => (
                    <SelectItem key={fiat} value={fiat}>
                      {fiat}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              className="text-xs text-muted-foreground"
              htmlFor="syntax-filter-crypto"
            >
              {t('rate.syntax.filter-crypto')}
            </Label>
            <Select value={filterCrypto} onValueChange={setFilterCrypto}>
              <SelectTrigger
                id="syntax-filter-crypto"
                className="h-10 md:h-9 md:w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('rate.list.filter-all')}</SelectItem>
                {(
                  tradeCryptos.length > 0
                    ? tradeCryptos
                    : unique(list.map((r) => r.crypto))
                ).map((crypto) => (
                  <SelectItem key={crypto} value={crypto}>
                    {crypto}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-10 md:h-9"
            onClick={() => setSyncOpen(true)}
          >
            <Settings2 className="size-4" />
            {t('rate.syntax.sync-btn')}
          </Button>
          <Button
            variant="destructive"
            className="h-10 md:h-9"
            onClick={() => setAtomOpen(true)}
          >
            {t('rate.syntax.atom-btn')}
          </Button>
        </div>
      </div>

      {/* 语法列表 */}
      <Card>
        <CardContent className="p-0 pb-4">
          {query.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState className="py-16" description={t('empty.title')} />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[590px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28 text-center">
                      {t('rate.syntax.column-fiat')}
                    </TableHead>
                    <TableHead className="w-28 text-center">
                      {t('rate.syntax.column-crypto')}
                    </TableHead>
                    <TableHead className="min-w-64">
                      {t('rate.syntax.column-syntax')}
                    </TableHead>
                    <TableHead className="w-24 text-center">
                      {t('rate.syntax.column-actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden>{getFiatFlag(row.fiat)}</span>
                          <span className="font-medium">{row.fiat}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={cryptoBadgeVariant(row.crypto)}>
                          {row.crypto}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono font-medium">
                            {row.syntax || t('rate.syntax.syntax-none')}
                          </span>
                          <span className="text-xs italic text-muted-foreground">
                            {renderTableDescription(t, describeSyntax(row.syntax))}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() => setEditRecord(row)}
                        >
                          <Pencil className="size-3.5" />
                          {t('rate.syntax.edit')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditSyntaxDialog record={editRecord} onOpenChange={(open) => !open && setEditRecord(null)} />
      <SyncConfigDialog open={syncOpen} onOpenChange={setSyncOpen} />
      <AtomConfigDialog open={atomOpen} onOpenChange={setAtomOpen} />
    </div>
  )
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

/** 颗粒度表单 → 输入框字符串 */
function atomFormToStrings(form: AtomFormState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of ATOM_KEYS) {
    const name = key.replace('atom_', '')
    out[name] = String(form[name as keyof AtomFormState])
  }
  return out
}

/** 输入框字符串 → 颗粒度表单（空/非法 → NaN，提交时按缺失处理） */
function atomFormFromStrings(
  text: Record<string, string>,
): AtomFormState {
  const read = (name: string): number => {
    const raw = (text[name] ?? '').trim()
    if (raw === '') return NaN
    const v = Number(raw)
    return Number.isNaN(v) ? NaN : v
  }
  return {
    usdt: read('usdt'),
    usdc: read('usdc'),
    trx: read('trx'),
    eth: read('eth'),
    bnb: read('bnb'),
    gram: read('gram'),
  }
}
