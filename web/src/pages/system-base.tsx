import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react'
import {
  fetchCheckoutList,
  getConfs,
  resetApiAuthToken,
  setConfs,
  setNotifierConf,
  testNotifier,
  type Checkout,
  type ConfSetReq,
} from '@/api/conf'
import { setSecurity } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { useAuthStore } from '@/stores/auth'
import { useTradeMeta } from '@/hooks/use-trade-meta'
import {
  isPasswordChange,
  validateNewPassword,
  validateSecure,
} from '@/lib/security'
import {
  filterNotifierParams,
  isPositiveInteger,
  isPositiveNumber,
  isTimeoutInRange,
  normalizeNetworkOrder,
  normalizePaymentCheckout,
  parseNotifierParams,
  validateTopicPrefix,
} from '@/lib/system-base'
import { cn } from '@/lib/utils'
// 旧版 base.vue 使用的原项目作者 GitHub 头像，已下载为本地文件，运行时不请求外链
import avatarUrl from '@/assets/avatar.jpg'

/** 旧版 base.vue getsConfAPI 请求的配置键（顺序保持一致） */
const CONF_KEYS = [
  'payment_match_mode',
  'api_app_uri',
  'api_auth_token',
  'admin_username',
  'admin_secure',
  'block_height_max_diff',
  'block_offset_confirm',
  'admin_login_at',
  'admin_login_ip',
  'notify_max_retry',
  'payment_max_amount',
  'payment_min_amount',
  'payment_support_url',
  'payment_checkout',
  'payment_network_sort',
  'payment_timeout',
  'payment_lookback_hour',
  'notifier_params',
  'notifier_channel',
  'mqtt_host',
  'mqtt_port',
  'mqtt_user',
  'mqtt_pass',
  'mqtt_publish_qos',
  'mqtt_networks',
  'mqtt_topic_prefix',
  'home_redirect_url',
]

const CONF_QUERY_KEY = 'system-base-conf'

type Conf = Record<string, string>

/** 稳定的空配置，避免 query 失败时每次渲染都重置表单 */
const EMPTY_CONF: Conf = {}

/** 旧版 ?type= 1/2/3/4/5 -> 分区 */
const LEGACY_TAB: Record<string, string> = {
  '1': 'info',
  '2': 'notifier',
  '3': 'security',
  '4': 'api',
  '5': 'mqtt',
}

/* ---------------------------------- 通用小组件 ---------------------------------- */

/** 表单字段：label + 控件 + 说明 / 错误文案 */
function Field({
  label,
  htmlFor,
  extra,
  error,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  extra?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : extra ? (
        <p className="text-xs break-words text-muted-foreground">{extra}</p>
      ) : null}
    </div>
  )
}

/** 信息条（对应旧版 a-alert info / warning） */
function Notice({
  variant = 'info',
  children,
}: {
  variant?: 'info' | 'warning'
  children: React.ReactNode
}) {
  return (
    <div
      role="note"
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        variant === 'info'
          ? 'border-border bg-muted/50 text-foreground'
          : 'border-primary/40 bg-primary/5 text-foreground',
      )}
    >
      {children}
    </div>
  )
}

/** 分区保存按钮：dirty 时提示未保存，未修改时禁用 */
function SaveButton({
  dirty,
  pending,
  label,
}: {
  dirty: boolean
  pending: boolean
  label: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" className="h-10 md:h-9" disabled={!dirty || pending}>
        {pending ? t('systemBase.saving') : label}
      </Button>
      {dirty && !pending && (
        <span className="text-xs text-muted-foreground">
          {t('systemBase.unsaved')}
        </span>
      )}
    </div>
  )
}

/* ---------------------------------- 基本信息 ---------------------------------- */

interface InfoForm {
  payment_timeout: string
  block_height_max_diff: string
  block_offset_confirm: string
  notify_max_retry: string
  payment_max_amount: string
  payment_min_amount: string
  payment_match_mode: string
  home_redirect_url: string
  payment_lookback_hour: string
}

function initInfoForm(conf: Conf): InfoForm {
  return {
    block_height_max_diff: conf.block_height_max_diff ?? '',
    block_offset_confirm: conf.block_offset_confirm || '0',
    notify_max_retry: conf.notify_max_retry ?? '',
    payment_max_amount: conf.payment_max_amount ?? '',
    payment_min_amount: conf.payment_min_amount ?? '',
    payment_timeout: conf.payment_timeout ?? '',
    payment_match_mode: conf.payment_match_mode || 'classic',
    home_redirect_url: conf.home_redirect_url || '',
    payment_lookback_hour: conf.payment_lookback_hour || '',
  }
}

function InfoSection({ conf, onSaved }: { conf: Conf; onSaved: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<InfoForm>(() => initInfoForm(conf))
  const [initial, setInitial] = useState<InfoForm>(() => initInfoForm(conf))
  const [errors, setErrors] = useState<Partial<Record<keyof InfoForm, string>>>({})

  useEffect(() => {
    const next = initInfoForm(conf)
    setForm(next)
    setInitial(next)
    setErrors({})
  }, [conf])

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  const mutation = useMutation({
    mutationFn: (items: ConfSetReq[]) => setConfs(items),
    onSuccess: () => {
      toast.success(t('systemBase.save-success'))
      onSaved()
    },
  })

  const set = (key: keyof InfoForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err: Partial<Record<keyof InfoForm, string>> = {}
    const req = (field: string) => t('systemBase.error-required', { field })
    const pos = (field: string) => t('systemBase.error-positive', { field })

    if (!form.block_height_max_diff)
      err.block_height_max_diff = req(t('systemBase.info.block-height-max-diff'))
    else if (!isPositiveNumber(form.block_height_max_diff))
      err.block_height_max_diff = pos(t('systemBase.info.block-height-max-diff'))

    if (!form.notify_max_retry)
      err.notify_max_retry = req(t('systemBase.info.notify-max-retry'))
    else if (!isPositiveNumber(form.notify_max_retry))
      err.notify_max_retry = pos(t('systemBase.info.notify-max-retry'))

    if (!form.payment_min_amount)
      err.payment_min_amount = req(t('systemBase.info.payment-min-amount'))
    else if (!isPositiveNumber(form.payment_min_amount))
      err.payment_min_amount = pos(t('systemBase.info.payment-min-amount'))

    if (!form.payment_max_amount)
      err.payment_max_amount = req(t('systemBase.info.payment-max-amount'))
    else if (!isPositiveNumber(form.payment_max_amount))
      err.payment_max_amount = pos(t('systemBase.info.payment-max-amount'))

    if (!form.payment_timeout) {
      err.payment_timeout = req(t('systemBase.info.payment-timeout'))
    } else if (!isTimeoutInRange(form.payment_timeout)) {
      err.payment_timeout = t('systemBase.error-timeout-range')
    }

    if (!form.payment_lookback_hour)
      err.payment_lookback_hour = req(t('systemBase.info.payment-lookback-hour'))
    else if (!isPositiveInteger(form.payment_lookback_hour))
      err.payment_lookback_hour = t('systemBase.error-integer', {
        field: t('systemBase.info.payment-lookback-hour'),
      })

    if (!form.payment_match_mode)
      err.payment_match_mode = req(t('systemBase.info.payment-match-mode'))

    setErrors(err)
    if (Object.keys(err).length > 0) return

    mutation.mutate([
      { key: 'block_height_max_diff', value: form.block_height_max_diff },
      { key: 'block_offset_confirm', value: form.block_offset_confirm },
      { key: 'notify_max_retry', value: form.notify_max_retry },
      { key: 'payment_max_amount', value: form.payment_max_amount },
      { key: 'payment_min_amount', value: form.payment_min_amount },
      { key: 'payment_timeout', value: form.payment_timeout },
      { key: 'payment_match_mode', value: form.payment_match_mode },
      { key: 'home_redirect_url', value: form.home_redirect_url },
      { key: 'payment_lookback_hour', value: form.payment_lookback_hour },
    ])
  }

  const i = 'systemBase.info'

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <Field
        label={t(`${i}.block-height-max-diff`)}
        htmlFor="info-block-diff"
        error={errors.block_height_max_diff}
        extra={t(`${i}.block-height-max-diff-extra`)}
      >
        <Input
          id="info-block-diff"
          className="h-10 md:h-9"
          value={form.block_height_max_diff}
          placeholder={t(`${i}.block-height-max-diff-ph`)}
          onChange={(e) => set('block_height_max_diff', e.target.value)}
        />
      </Field>

      <Field
        label={t(`${i}.block-offset-confirm`)}
        error={errors.block_offset_confirm}
        extra={t(`${i}.block-offset-confirm-extra`)}
      >
        <Select
          value={form.block_offset_confirm}
          onValueChange={(v) => set('block_offset_confirm', v)}
        >
          <SelectTrigger className="h-10 md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t(`${i}.offset-off`)}</SelectItem>
            <SelectItem value="1">{t(`${i}.offset-on`)}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label={t(`${i}.notify-max-retry`)}
        htmlFor="info-notify-retry"
        error={errors.notify_max_retry}
        extra={t(`${i}.notify-max-retry-extra`)}
      >
        <Input
          id="info-notify-retry"
          className="h-10 md:h-9"
          value={form.notify_max_retry}
          placeholder={t(`${i}.notify-max-retry-ph`)}
          onChange={(e) => set('notify_max_retry', e.target.value)}
        />
      </Field>

      <Field
        label={t(`${i}.payment-min-amount`)}
        htmlFor="info-min-amount"
        error={errors.payment_min_amount}
        extra={t(`${i}.payment-min-amount-extra`)}
      >
        <Input
          id="info-min-amount"
          className="h-10 md:h-9"
          value={form.payment_min_amount}
          placeholder={t(`${i}.payment-min-amount-ph`)}
          onChange={(e) => set('payment_min_amount', e.target.value)}
        />
      </Field>

      <Field
        label={t(`${i}.payment-max-amount`)}
        htmlFor="info-max-amount"
        error={errors.payment_max_amount}
        extra={t(`${i}.payment-max-amount-extra`)}
      >
        <Input
          id="info-max-amount"
          className="h-10 md:h-9"
          value={form.payment_max_amount}
          placeholder={t(`${i}.payment-max-amount-ph`)}
          onChange={(e) => set('payment_max_amount', e.target.value)}
        />
      </Field>

      <Field
        label={t(`${i}.payment-timeout`)}
        htmlFor="info-timeout"
        error={errors.payment_timeout}
        extra={t(`${i}.payment-timeout-extra`)}
      >
        <Input
          id="info-timeout"
          className="h-10 md:h-9"
          value={form.payment_timeout}
          placeholder={t(`${i}.payment-timeout-ph`)}
          onChange={(e) => set('payment_timeout', e.target.value)}
        />
      </Field>

      <Field
        label={t(`${i}.payment-lookback-hour`)}
        htmlFor="info-lookback"
        error={errors.payment_lookback_hour}
        extra={t(`${i}.payment-lookback-hour-extra`)}
      >
        <Input
          id="info-lookback"
          className="h-10 md:h-9"
          value={form.payment_lookback_hour}
          placeholder={t(`${i}.payment-lookback-hour-ph`)}
          onChange={(e) => set('payment_lookback_hour', e.target.value)}
        />
      </Field>

      <Field
        label={t(`${i}.payment-match-mode`)}
        error={errors.payment_match_mode}
        extra={
          <>
            {t(`${i}.payment-match-mode-extra`)}{' '}
            <a
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
              href="https://github.com/Yachiiiiyo/BEpusdt/blob/main/docs/payment-match-mode/README.md"
              target="_blank"
              rel="noreferrer"
            >
              {t(`${i}.payment-match-mode-doc`)}
            </a>
          </>
        }
      >
        <Select
          value={form.payment_match_mode}
          onValueChange={(v) => set('payment_match_mode', v)}
        >
          <SelectTrigger className="h-10 md:h-9">
            <SelectValue placeholder={t('system.please select')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="classic">{t(`${i}.match-mode-classic`)}</SelectItem>
            <SelectItem value="has_prefix">{t(`${i}.match-mode-has-prefix`)}</SelectItem>
            <SelectItem value="round_off">{t(`${i}.match-mode-round-off`)}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label={t(`${i}.home-redirect-url`)}
        htmlFor="info-home-redirect"
        extra={t(`${i}.home-redirect-url-extra`)}
      >
        <Input
          id="info-home-redirect"
          className="h-10 md:h-9"
          value={form.home_redirect_url}
          placeholder={t(`${i}.home-redirect-url-ph`)}
          onChange={(e) => set('home_redirect_url', e.target.value)}
        />
      </Field>

      <SaveButton
        dirty={dirty}
        pending={mutation.isPending}
        label={t('systemBase.save')}
      />
    </form>
  )
}

/* ---------------------------------- API 对接 ---------------------------------- */

interface ApiForm {
  api_app_uri: string
  payment_checkout: string
  payment_support_url: string
  payment_network_sort: string
}

function initApiForm(conf: Conf): ApiForm {
  return {
    api_app_uri: conf.api_app_uri || '',
    payment_checkout: conf.payment_checkout || '',
    payment_support_url: conf.payment_support_url || '',
    payment_network_sort: conf.payment_network_sort || '',
  }
}

function ApiSection({ conf, onSaved }: { conf: Conf; onSaved: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { tradeNetworks } = useTradeMeta()
  const [form, setForm] = useState<ApiForm>(() => initApiForm(conf))
  const [initial, setInitial] = useState<ApiForm>(() => initApiForm(conf))
  const [showToken, setShowToken] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  useEffect(() => {
    const next = initApiForm(conf)
    setForm(next)
    setInitial(next)
  }, [conf])

  const checkoutQuery = useQuery({
    queryKey: ['checkout-list'],
    queryFn: () => fetchCheckoutList(),
  })

  const checkoutItems = useMemo(() => {
    const map = checkoutQuery.data ?? {}
    return Object.keys(map)
      .sort()
      .map((key) => ({ key, checkout: map[key] as Checkout }))
      .filter((item) => Boolean(item.checkout))
  }, [checkoutQuery.data])

  const checkoutValues = useMemo(
    () => checkoutItems.map((item) => item.key),
    [checkoutItems],
  )

  // 当前生效模板（保存时也会做同样规范化）
  const currentCheckout = normalizePaymentCheckout(
    form.payment_checkout,
    checkoutValues,
  )
  const currentCheckoutInfo = checkoutItems.find(
    (item) => item.key === currentCheckout,
  )

  const networkValues = useMemo(
    () => tradeNetworks.map((n) => n.value),
    [tradeNetworks],
  )
  const networkOrder = useMemo(
    () => normalizeNetworkOrder(form.payment_network_sort, networkValues),
    [form.payment_network_sort, networkValues],
  )
  const networkLabel = (value: string) =>
    tradeNetworks.find((n) => n.value === value)?.label ?? value

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  const mutation = useMutation({
    mutationFn: (items: ConfSetReq[]) => setConfs(items),
    onSuccess: () => {
      toast.success(t('systemBase.save-success'))
      onSaved()
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetApiAuthToken(),
    onSuccess: () => {
      toast.success(t('systemBase.api.reset-token-success'))
      setResetOpen(false)
      void queryClient.invalidateQueries({ queryKey: [CONF_QUERY_KEY] })
    },
    onError: () => setResetOpen(false),
  })

  const set = (key: keyof ApiForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const moveNetwork = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= networkOrder.length) return
    const next = [...networkOrder]
    ;[next[index], next[target]] = [next[target], next[index]]
    set('payment_network_sort', next.join(','))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate([
      { key: 'api_app_uri', value: form.api_app_uri },
      { key: 'payment_checkout', value: currentCheckout },
      { key: 'payment_support_url', value: form.payment_support_url },
      { key: 'payment_network_sort', value: networkOrder.join(',') },
    ])
  }

  const i = 'systemBase.api'
  const token = conf.api_auth_token ?? ''

  return (
    <div className="flex flex-col gap-5">
      <Notice>
        {t(`${i}.compat-alert`)}
      </Notice>

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Field
          label={t(`${i}.token`)}
          htmlFor="api-token"
          extra={t(`${i}.token-extra`)}
        >
          <div className="flex items-center gap-1.5">
            <Input
              id="api-token"
              className="h-10 flex-1 md:h-9"
              type={showToken ? 'text' : 'password'}
              readOnly
              value={token}
              placeholder={t(`${i}.token-ph`)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0 text-foreground md:size-9"
              aria-label={showToken ? t(`${i}.hide-token`) : t(`${i}.show-token`)}
              title={showToken ? t(`${i}.hide-token`) : t(`${i}.show-token`)}
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </Button>
            <CopyButton
              text={token}
              variant="outline"
              className="size-10 shrink-0 text-foreground md:size-9"
              iconClassName="size-5"
            />
            <Button
              type="button"
              variant="destructive"
              className="h-10 shrink-0 md:h-9"
              disabled={resetMutation.isPending}
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="size-4" />
              {t(`${i}.reset-token`)}
            </Button>
          </div>
        </Field>

        <Field
          label={t(`${i}.app-uri`)}
          htmlFor="api-app-uri"
          extra={t(`${i}.app-uri-extra`)}
        >
          <Input
            id="api-app-uri"
            className="h-10 md:h-9"
            value={form.api_app_uri}
            placeholder={t(`${i}.app-uri-ph`)}
            onChange={(e) => set('api_app_uri', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${i}.checkout`)}
          extra={
            currentCheckoutInfo ? (
              <>
                {t(`${i}.checkout-author`, { author: currentCheckoutInfo.checkout.author })}
                ，{currentCheckoutInfo.checkout.desc}
                {currentCheckoutInfo.checkout.link && (
                  <>
                    {' '}
                    <a
                      className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
                      href={currentCheckoutInfo.checkout.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t(`${i}.checkout-link`)}
                    </a>
                  </>
                )}
              </>
            ) : (
              t(`${i}.checkout-extra-none`)
            )
          }
        >
          <Select
            value={currentCheckout}
            onValueChange={(v) => set('payment_checkout', v)}
          >
            <SelectTrigger className="h-10 md:h-9">
              <SelectValue placeholder={t(`${i}.checkout-ph`)} />
            </SelectTrigger>
            <SelectContent>
              {checkoutItems.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.checkout.name || item.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label={t(`${i}.support-url`)}
          htmlFor="api-support-url"
          extra={t(`${i}.support-url-extra`)}
        >
          <Input
            id="api-support-url"
            className="h-10 md:h-9"
            value={form.payment_support_url}
            placeholder={t(`${i}.support-url-ph`)}
            onChange={(e) => set('payment_support_url', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${i}.network-sort`)}
          extra={t(`${i}.network-sort-extra`)}
        >
          <div className="flex items-center gap-3">
            <span
              className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
              title={networkOrder.map(networkLabel).join(' → ')}
            >
              {networkOrder.length > 0
                ? networkOrder.map(networkLabel).join(' → ')
                : t(`${i}.network-sort-empty`)}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 md:h-9"
              onClick={() => setSortOpen(true)}
            >
              {t(`${i}.network-sort-adjust`)}
            </Button>
          </div>
        </Field>

        <SaveButton
          dirty={dirty}
          pending={mutation.isPending}
          label={t('systemBase.save')}
        />
      </form>

      {/* 重置令牌强确认 */}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(next) => {
          if (resetMutation.isPending) return
          setResetOpen(next)
        }}
        title={t(`${i}.reset-token-title`)}
        description={t(`${i}.reset-token-desc`)}
        confirmText={t(`${i}.reset-token-confirm`)}
        destructive
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
      />

      {/* 网络排序弹窗 */}
      <Dialog
        open={sortOpen}
        onOpenChange={setSortOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(`${i}.network-sort-title`)}</DialogTitle>
            <DialogDescription>{t(`${i}.network-sort-tip`)}</DialogDescription>
          </DialogHeader>
          {networkOrder.length > 0 ? (
            <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {networkOrder.map((network, index) => (
                <div
                  key={network}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-1.5"
                >
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-neutral-950 tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {networkLabel(network)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {network}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0 text-foreground"
                    aria-label={t(`${i}.network-sort-move-up`)}
                    title={t(`${i}.network-sort-move-up`)}
                    disabled={index === 0}
                    onClick={() => moveNetwork(index, -1)}
                  >
                    <ChevronUp className="size-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0 text-foreground"
                    aria-label={t(`${i}.network-sort-move-down`)}
                    title={t(`${i}.network-sort-move-down`)}
                    disabled={index === networkOrder.length - 1}
                    onClick={() => moveNetwork(index, 1)}
                  >
                    <ChevronDown className="size-5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t(`${i}.network-sort-empty`)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              className="h-10 md:h-9"
              onClick={() => setSortOpen(false)}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ----------------------------------- MQTT ----------------------------------- */

interface MqttForm {
  mqtt_host: string
  mqtt_port: string
  mqtt_user: string
  mqtt_pass: string
  mqtt_publish_qos: string
  mqtt_networks: string
  mqtt_topic_prefix: string
}

function initMqttForm(conf: Conf): MqttForm {
  return {
    mqtt_host: conf.mqtt_host ?? '',
    mqtt_port: conf.mqtt_port ?? '',
    mqtt_user: conf.mqtt_user ?? '',
    mqtt_pass: conf.mqtt_pass ?? '',
    mqtt_publish_qos: conf.mqtt_publish_qos ?? '0',
    mqtt_networks: conf.mqtt_networks ?? '',
    mqtt_topic_prefix: conf.mqtt_topic_prefix ?? 'bepusdt',
  }
}

function MqttSection({ conf, onSaved }: { conf: Conf; onSaved: () => void }) {
  const { t } = useTranslation()
  const { tradeNetworks } = useTradeMeta()
  const [form, setForm] = useState<MqttForm>(() => initMqttForm(conf))
  const [initial, setInitial] = useState<MqttForm>(() => initMqttForm(conf))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const next = initMqttForm(conf)
    setForm(next)
    setInitial(next)
    setError(null)
  }, [conf])

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  const mutation = useMutation({
    mutationFn: (items: ConfSetReq[]) => setConfs(items),
    onSuccess: () => {
      toast.success(t('systemBase.save-success'))
      onSaved()
    },
  })

  const set = (key: keyof MqttForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const selectedNetworks = form.mqtt_networks
    ? form.mqtt_networks.split(',').filter(Boolean)
    : []

  const toggleNetwork = (value: string, checked: boolean) => {
    const next = checked
      ? [...selectedNetworks, value]
      : selectedNetworks.filter((item) => item !== value)
    set('mqtt_networks', next.join(','))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = validateTopicPrefix(form.mqtt_topic_prefix)
    if (code) {
      setError(t(`systemBase.mqtt.topic-prefix-error-${code}`))
      return
    }
    setError(null)
    mutation.mutate([
      { key: 'mqtt_host', value: form.mqtt_host },
      { key: 'mqtt_port', value: form.mqtt_port },
      { key: 'mqtt_user', value: form.mqtt_user },
      { key: 'mqtt_pass', value: form.mqtt_pass },
      { key: 'mqtt_publish_qos', value: form.mqtt_publish_qos },
      { key: 'mqtt_networks', value: form.mqtt_networks },
      { key: 'mqtt_topic_prefix', value: form.mqtt_topic_prefix || 'bepusdt' },
    ])
  }

  const i = 'systemBase.mqtt'

  return (
    <div className="flex flex-col gap-5">
      <Notice>
        {t(`${i}.info-alert`)}{' '}
        <a
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
          href="https://github.com/Yachiiiiyo/BEpusdt/blob/main/docs/api/mqtt.md"
          target="_blank"
          rel="noreferrer"
        >
          {t(`${i}.info-alert-doc`)}
        </a>
      </Notice>
      <Notice variant="warning">{t(`${i}.warning-alert`)}</Notice>

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Field
          label={t(`${i}.host`)}
          htmlFor="mqtt-host"
          extra={t(`${i}.host-extra`)}
        >
          <Input
            id="mqtt-host"
            className="h-10 md:h-9"
            value={form.mqtt_host}
            placeholder={t(`${i}.host-ph`)}
            onChange={(e) => set('mqtt_host', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${i}.port`)}
          htmlFor="mqtt-port"
          extra={t(`${i}.port-extra`)}
        >
          <Input
            id="mqtt-port"
            className="h-10 md:h-9"
            value={form.mqtt_port}
            placeholder={t(`${i}.port-ph`)}
            onChange={(e) => set('mqtt_port', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${i}.user`)}
          htmlFor="mqtt-user"
          extra={t(`${i}.user-extra`)}
        >
          <Input
            id="mqtt-user"
            className="h-10 md:h-9"
            value={form.mqtt_user}
            placeholder={t(`${i}.user-ph`)}
            onChange={(e) => set('mqtt_user', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${i}.pass`)}
          htmlFor="mqtt-pass"
          extra={t(`${i}.pass-extra`)}
        >
          <Input
            id="mqtt-pass"
            type="password"
            className="h-10 md:h-9"
            value={form.mqtt_pass}
            placeholder={t(`${i}.pass-ph`)}
            onChange={(e) => set('mqtt_pass', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${i}.topic-prefix`)}
          htmlFor="mqtt-topic-prefix"
          error={error}
          extra={t(`${i}.topic-prefix-extra`)}
        >
          <Input
            id="mqtt-topic-prefix"
            className="h-10 md:h-9"
            value={form.mqtt_topic_prefix}
            placeholder={t(`${i}.topic-prefix-ph`)}
            onChange={(e) => set('mqtt_topic_prefix', e.target.value)}
          />
        </Field>

        <Field label={t(`${i}.qos`)} extra={t(`${i}.qos-extra`)}>
          <RadioGroup
            className="gap-2"
            value={form.mqtt_publish_qos}
            onValueChange={(v) => set('mqtt_publish_qos', v)}
          >
            {['0', '1', '2'].map((qos) => (
              <label
                key={qos}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm"
              >
                <RadioGroupItem value={qos} />
                {t(`${i}.qos-${qos}`)}
              </label>
            ))}
          </RadioGroup>
        </Field>

        <Field
          label={t(`${i}.networks`)}
          extra={t(`${i}.networks-extra`)}
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
            {tradeNetworks.map((network) => (
              <label
                key={network.value}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5"
              >
                <Checkbox
                  checked={selectedNetworks.includes(network.value)}
                  onCheckedChange={(checked) =>
                    toggleNetwork(network.value, checked === true)
                  }
                />
                <span className="truncate">{network.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <SaveButton
          dirty={dirty}
          pending={mutation.isPending}
          label={t('systemBase.save')}
        />
      </form>
    </div>
  )
}

/* ----------------------------------- 通知 ----------------------------------- */

interface NotifierFieldDef {
  key: string
  label: string
  placeholderKey: string
  required: boolean
}

interface NotifierChannelDef {
  value: string
  labelKey: string
  disabled: boolean
  fields: NotifierFieldDef[]
}

/** 渠道与字段定义（与 notifier.vue channelConfigs 一致，wechat/email 开发中禁用） */
const NOTIFIER_CHANNELS: NotifierChannelDef[] = [
  { value: 'none', labelKey: 'systemBase.notifier.channel-none', disabled: false, fields: [] },
  {
    value: 'telegram',
    labelKey: 'systemBase.notifier.channel-telegram',
    disabled: false,
    fields: [
      { key: 'bot_token', label: 'Bot Token', placeholderKey: 'field-bot-token-ph', required: true },
      { key: 'chat_id', label: 'Chat ID', placeholderKey: 'field-chat-id-ph', required: true },
      { key: 'topic_id', label: 'Topic ID', placeholderKey: 'field-topic-id-ph', required: false },
    ],
  },
  {
    value: 'bark',
    labelKey: 'systemBase.notifier.channel-bark',
    disabled: false,
    fields: [
      { key: 'device_key', label: 'Device Key', placeholderKey: 'field-device-key-ph', required: true },
      { key: 'server', label: 'Server', placeholderKey: 'field-server-ph', required: false },
      { key: 'sound', label: 'Sound', placeholderKey: 'field-sound-ph', required: false },
    ],
  },
  {
    value: 'wechat',
    labelKey: 'systemBase.notifier.channel-wechat',
    disabled: true,
    fields: [],
  },
  {
    value: 'email',
    labelKey: 'systemBase.notifier.channel-email',
    disabled: true,
    fields: [],
  },
]

function initNotifierParams(): Record<string, string> {
  const params: Record<string, string> = {}
  for (const channel of NOTIFIER_CHANNELS) {
    for (const field of channel.fields) params[field.key] = ''
  }
  return params
}

function initNotifierForm(conf: Conf): {
  channel: string
  params: Record<string, string>
} {
  return {
    channel: String(conf.notifier_channel || 'telegram'),
    params: { ...initNotifierParams(), ...parseNotifierParams(conf.notifier_params) },
  }
}

function NotifierSection({ conf, onSaved }: { conf: Conf; onSaved: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => initNotifierForm(conf))
  const [initial, setInitial] = useState(() => initNotifierForm(conf))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const next = initNotifierForm(conf)
    setForm(next)
    setInitial(next)
    setErrors({})
  }, [conf])

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  const currentChannel = NOTIFIER_CHANNELS.find((c) => c.value === form.channel)

  const mutation = useMutation({
    mutationFn: () =>
      setNotifierConf({
        channel: form.channel,
        params: filterNotifierParams(
          form.params,
          (currentChannel?.fields ?? []).map((f) => f.key),
        ),
      }),
    onSuccess: () => {
      toast.success(t('systemBase.notifier.config-success'))
      onSaved()
    },
  })

  const testMutation = useMutation({
    mutationFn: () => testNotifier(),
    onSuccess: (msg) => {
      // 后端把测试结果放在 msg（成功 / 发送测试失败：...），直接展示
      const text = msg || t('systemBase.notifier.test-fallback')
      if (text.includes('失败')) toast.error(text)
      else toast.success(text)
    },
  })

  const handleChannelChange = (value: string) => {
    // 切换渠道时重置参数（与旧版 onChannelChange 一致）
    setForm({ channel: value, params: initNotifierParams() })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    for (const field of currentChannel?.fields ?? []) {
      if (field.required && !form.params[field.key]) {
        err[field.key] = t('systemBase.error-required', { field: field.label })
      }
    }
    setErrors(err)
    if (Object.keys(err).length > 0) return
    mutation.mutate()
  }

  const i = 'systemBase.notifier'

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <Field label={t(`${i}.channel`)}>
        <Select value={form.channel} onValueChange={handleChannelChange}>
          <SelectTrigger className="h-10 md:h-9">
            <SelectValue placeholder={t(`${i}.channel-ph`)} />
          </SelectTrigger>
          <SelectContent>
            {NOTIFIER_CHANNELS.map((channel) => (
              <SelectItem key={channel.value} value={channel.value} disabled={channel.disabled}>
                {t(channel.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {(currentChannel?.fields ?? []).map((field) => (
        <Field
          key={field.key}
          label={field.label}
          htmlFor={`notifier-${field.key}`}
          error={errors[field.key]}
        >
          <Input
            id={`notifier-${field.key}`}
            className="h-10 md:h-9"
            value={form.params[field.key] ?? ''}
            placeholder={t(`systemBase.notifier.${field.placeholderKey}`)}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                params: { ...prev.params, [field.key]: e.target.value },
              }))
            }
          />
        </Field>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton
          dirty={dirty}
          pending={mutation.isPending}
          label={t('systemBase.save-notifier')}
        />
        {form.channel !== 'none' && (
          <Button
            type="button"
            variant="outline"
            className="h-10 md:h-9"
            disabled={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending && <RotateCcw className="size-4 animate-spin" />}
            {t(`${i}.test`)}
          </Button>
        )}
      </div>
    </form>
  )
}

/* ----------------------------------- 安全 ----------------------------------- */

interface SecurityForm {
  admin_secure: string
  admin_username: string
  password: string
  new_password: string
  confirm_password: string
}

function initSecurityForm(conf: Conf): SecurityForm {
  return {
    admin_secure: conf.admin_secure || '',
    admin_username: conf.admin_username || '',
    password: '',
    new_password: '',
    confirm_password: '',
  }
}

function SecuritySection({ conf, onSaved }: { conf: Conf; onSaved: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<SecurityForm>(() => initSecurityForm(conf))
  const [initial, setInitial] = useState<SecurityForm>(() => initSecurityForm(conf))
  const [errors, setErrors] = useState<Partial<Record<keyof SecurityForm, string>>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const next = initSecurityForm(conf)
    setForm(next)
    setInitial(next)
    setErrors({})
  }, [conf])

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  )

  const clearPasswords = () =>
    setForm((prev) => ({
      ...prev,
      password: '',
      new_password: '',
      confirm_password: '',
    }))

  const mutation = useMutation({
    mutationFn: () =>
      setSecurity({
        admin_secure: form.admin_secure,
        admin_username: form.admin_username,
        password: form.password,
        new_password: form.new_password,
        confirm_password: form.confirm_password,
      }),
    onSuccess: (result) => {
      setConfirmOpen(false)
      if (result?.relogin) {
        // 密码已修改，token 失效：清登录态并跳转登录页（与旧版行为一致）
        toast.success(t('systemBase.security.relogin-msg'))
        useAuthStore.getState().clear()
        const basePath = window.location.pathname.split('#')[0]
        window.location.href = `${basePath}#/login`
        return
      }
      toast.success(t('systemBase.save-success'))
      clearPasswords()
      onSaved()
    },
    onError: () => setConfirmOpen(false),
  })

  const set = (key: keyof SecurityForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err: Partial<Record<keyof SecurityForm, string>> = {}
    const req = (field: string) => t('systemBase.error-required', { field })
    const s = 'systemBase.security'

    if (!form.admin_secure) {
      err.admin_secure = req(t(`${s}.admin-secure`))
    } else {
      const code = validateSecure(form.admin_secure)
      if (code === 'prefix') err.admin_secure = t(`${s}.error-secure-prefix`)
      else if (code === 'length') err.admin_secure = t(`${s}.error-secure-length`)
      else if (code === 'charset') err.admin_secure = t(`${s}.error-secure-charset`)
    }

    if (!form.admin_username)
      err.admin_username = req(t(`${s}.admin-username`))
    if (!form.password) err.password = req(t(`${s}.password`))

    if (form.new_password && !form.confirm_password) {
      err.confirm_password = t(`${s}.error-confirm-required`)
    } else if (isPasswordChange(form.new_password, form.confirm_password)) {
      const code = validateNewPassword(
        form.new_password,
        form.confirm_password,
        true,
      )
      if (code === 'mismatch') err.confirm_password = t(`${s}.error-new-password-mismatch`)
      else if (code === 'min') err.new_password = t(`${s}.error-new-password-min`)
      else if (code === 'max') err.new_password = t(`${s}.error-new-password-max`)
    }

    setErrors(err)
    if (Object.keys(err).length > 0) return
    setConfirmOpen(true)
  }

  const s = 'systemBase.security'

  return (
    <>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Field
          label={t(`${s}.admin-secure`)}
          htmlFor="security-secure"
          error={errors.admin_secure}
          extra={t(`${s}.admin-secure-extra`)}
        >
          <Input
            id="security-secure"
            className="h-10 md:h-9"
            value={form.admin_secure}
            placeholder={t(`${s}.admin-secure-ph`)}
            onChange={(e) => set('admin_secure', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${s}.admin-username`)}
          htmlFor="security-username"
          error={errors.admin_username}
        >
          <Input
            id="security-username"
            className="h-10 md:h-9"
            value={form.admin_username}
            placeholder={t(`${s}.admin-username-ph`)}
            onChange={(e) => set('admin_username', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${s}.password`)}
          htmlFor="security-password"
          error={errors.password}
          extra={t(`${s}.password-extra`)}
        >
          <Input
            id="security-password"
            type="password"
            className="h-10 md:h-9"
            value={form.password}
            placeholder={t(`${s}.password-ph`)}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${s}.new-password`)}
          htmlFor="security-new-password"
          error={errors.new_password}
          extra={t(`${s}.new-password-extra`)}
        >
          <Input
            id="security-new-password"
            type="password"
            className="h-10 md:h-9"
            value={form.new_password}
            placeholder={t(`${s}.new-password-ph`)}
            onChange={(e) => set('new_password', e.target.value)}
          />
        </Field>

        <Field
          label={t(`${s}.confirm-password`)}
          htmlFor="security-confirm-password"
          error={errors.confirm_password}
        >
          <Input
            id="security-confirm-password"
            type="password"
            className="h-10 md:h-9"
            value={form.confirm_password}
            placeholder={t(`${s}.confirm-password-ph`)}
            onChange={(e) => set('confirm_password', e.target.value)}
          />
        </Field>

        <SaveButton
          dirty={dirty}
          pending={mutation.isPending}
          label={t('systemBase.save-security')}
        />
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (mutation.isPending) return
          setConfirmOpen(next)
        }}
        title={t(`${s}.confirm-title`)}
        description={t(`${s}.confirm-desc`)}
        confirmText={t(`${s}.confirm-btn`)}
        destructive
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  )
}

/* ----------------------------------- 页面 ----------------------------------- */

export default function SystemBasePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const query = useQuery({
    queryKey: [CONF_QUERY_KEY],
    queryFn: () => getConfs(CONF_KEYS),
  })
  const conf: Conf = query.data ?? EMPTY_CONF

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [CONF_QUERY_KEY] })
  }

  // 旧版通过 ?type=1..5 定位分区
  const defaultTab =
    LEGACY_TAB[searchParams.get('type') ?? ''] ?? 'info'
  const [tab, setTab] = useState(defaultTab)

  const loading = query.isLoading

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('systemBase.title')}</h1>

      {/* 管理员信息（对应旧版顶部：左侧头像 + 右侧 descriptions） */}
      <Card>
        <CardContent className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:gap-6">
          <img
            src={avatarUrl}
            alt=""
            width={100}
            height={100}
            className="size-[100px] shrink-0 rounded-full bg-white object-cover ring-1 ring-border"
          />
          <div className="flex w-full min-w-0 flex-col gap-3">
            <h2 className="text-base font-semibold">{t('systemBase.profile-title')}</h2>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {loading ? (
                <>
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('systemBase.profile-admin')}
                    </span>
                    <span className="text-sm font-medium break-all">
                      {conf.admin_username || '-'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('systemBase.profile-login-at')}
                    </span>
                    <span className="text-sm font-medium break-all">
                      {conf.admin_login_at || '-'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('systemBase.profile-login-ip')}
                    </span>
                    <span className="text-sm font-medium break-all">
                      {conf.admin_login_ip || t('systemBase.profile-login-ip-empty')}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-10" />
              ))}
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto max-w-full flex-wrap justify-start">
                <TabsTrigger value="info">{t('systemBase.tab-info')}</TabsTrigger>
                <TabsTrigger value="notifier">{t('systemBase.tab-notifier')}</TabsTrigger>
                <TabsTrigger value="api">{t('systemBase.tab-api')}</TabsTrigger>
                <TabsTrigger value="mqtt">{t('systemBase.tab-mqtt')}</TabsTrigger>
                <TabsTrigger value="security">{t('systemBase.tab-security')}</TabsTrigger>
              </TabsList>
              {/* forceMount：切换分区时保留其它分区的未保存编辑（与旧版行为一致） */}
              <TabsContent value="info" forceMount className="mt-5">
                <div hidden={tab !== 'info'}>
                  <InfoSection conf={conf} onSaved={invalidate} />
                </div>
              </TabsContent>
              <TabsContent value="notifier" forceMount className="mt-5">
                <div hidden={tab !== 'notifier'}>
                  <NotifierSection conf={conf} onSaved={invalidate} />
                </div>
              </TabsContent>
              <TabsContent value="api" forceMount className="mt-5">
                <div hidden={tab !== 'api'}>
                  <ApiSection conf={conf} onSaved={invalidate} />
                </div>
              </TabsContent>
              <TabsContent value="mqtt" forceMount className="mt-5">
                <div hidden={tab !== 'mqtt'}>
                  <MqttSection conf={conf} onSaved={invalidate} />
                </div>
              </TabsContent>
              <TabsContent value="security" forceMount className="mt-5">
                <div hidden={tab !== 'security'}>
                  <SecuritySection conf={conf} onSaved={invalidate} />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
