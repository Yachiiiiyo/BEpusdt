import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchDashboardHome, type DashboardHome, type DashboardPoint } from '@/api/dashboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useTradeMeta } from '@/hooks/use-trade-meta'
import {
  DEFAULT_FIAT,
  customRangeToFromTo,
  fiatSymbol,
  formatKpiAmount,
  formatPeriodLabel,
  resolveFiatOptions,
  successRatePercent,
  tokenShareRows,
} from '@/lib/dashboard'
import { cn } from '@/lib/utils'

const RANGES = ['today', '7d', '30d', 'custom'] as const
type RangeKey = (typeof RANGES)[number]

/** 当前时区（对齐旧版：Intl 解析，缺省 Asia/Shanghai） */
function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

/** 监听 documentElement class 变化判断深色模式（theme store 会切换 .dark） */
function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const el = document.documentElement
    const observer = new MutationObserver(() => setDark(el.classList.contains('dark')))
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

/** 读取 CSS 变量色值（recharts 的 fill/stroke 需要具体颜色值） */
function useChartColors() {
  const dark = useIsDark()
  return useMemo(() => {
    if (typeof window === 'undefined') return {}
    const style = getComputedStyle(document.documentElement)
    const read = (name: string) => style.getPropertyValue(name).trim()
    return {
      accent: read('--primary') || '#F38020',
      muted: read('--muted-foreground') || '#86909c',
      grid: dark ? '#373738' : '#ebedf0',
      card: dark ? '#1c1c1d' : '#ffffff',
      dark,
    }
  }, [dark])
}

function KpiCard({
  title,
  value,
  subLabel,
  subValue,
  dotColor,
}: {
  title: string
  value: string
  subLabel?: string
  subValue?: string
  dotColor?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full border-2"
            style={{ borderColor: dotColor ?? 'var(--primary)' }}
          />
          <span className="text-sm text-muted-foreground">{title}</span>
        </div>
        <div className="mt-3 text-2xl font-semibold leading-8 break-all">{value}</div>
        {subLabel && subValue ? (
          <div className="mt-1 flex gap-1.5 text-xs text-muted-foreground">
            <span>{subLabel}</span>
            <span className="font-medium text-foreground/80">{subValue}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TrendChart({ points, fiat }: { points: DashboardPoint[]; fiat: string }) {
  const { t } = useTranslation()
  const colors = useChartColors()
  const data = useMemo(
    () =>
      points.map((p) => ({
        date: String(p.date || '').slice(5).replace('-', '/'),
        total: Number(p.orders_total || 0),
        paid: Number(p.orders_paid ?? p.orders_success ?? 0),
        success: Number(p.orders_success || 0),
        failed: Number(p.orders_failed || 0),
        gmv: formatKpiAmount(p.gmv_paid),
        gmvValue: Number(p.gmv_paid || 0),
      })),
    [points],
  )
  const isEmpty = !data.some((d) => d.total || d.paid)
  if (isEmpty) {
    return <EmptyState className="h-full min-h-64" description={t('home.chart-no-order-data')} />
  }
  const symbol = fiatSymbol(fiat)
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: colors.muted }}
          axisLine={{ stroke: colors.grid }}
          tickLine={false}
        />
        <YAxis
          yAxisId="count"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: colors.muted }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="gmv"
          orientation="right"
          tick={{ fontSize: 11, fill: colors.muted }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: colors.card,
            border: `1px solid ${colors.grid}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => {
            if (name === t('home.kpi-gmv')) return `${symbol}${formatKpiAmount(value as number)}`
            return value as number
          }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="count"
          dataKey="total"
          name={t('home.kpi-total')}
          fill={colors.accent}
          radius={[3, 3, 0, 0]}
          maxBarSize={12}
        />
        <Bar
          yAxisId="count"
          dataKey="paid"
          name={t('home.kpi-paid-orders')}
          fill="#4080FF"
          radius={[3, 3, 0, 0]}
          maxBarSize={12}
        />
        <Bar
          yAxisId="count"
          dataKey="success"
          name={t('home.kpi-success')}
          fill="#14A058"
          radius={[3, 3, 0, 0]}
          maxBarSize={12}
        />
        <Bar
          yAxisId="count"
          dataKey="failed"
          name={t('home.kpi-failed')}
          fill="#E33E38"
          radius={[3, 3, 0, 0]}
          maxBarSize={12}
        />
        <Line
          yAxisId="gmv"
          type="monotone"
          dataKey="gmvValue"
          name={t('home.kpi-gmv')}
          stroke={colors.accent}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

const TOKEN_COLORS: Record<string, string> = {
  USDT: '#F38020',
  USDC: '#32CD32',
  TRX: '#FF4500',
  BNB: '#F5A623',
  ETH: '#722ED1',
}
const TOKEN_FALLBACK = ['#F38020', '#4080FF', '#14A058', '#722ED1', '#E33E38', '#00B4D8']

function TokenPie({ tokenMap }: { tokenMap: Record<string, number> }) {
  const { t } = useTranslation()
  const colors = useChartColors()
  const rows = useMemo(() => tokenShareRows(tokenMap), [tokenMap])
  if (rows.length === 0) {
    return <EmptyState className="h-full min-h-64" description={t('home.chart-no-trade-data')} />
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={280}>
      <PieChart>
        <Tooltip
          contentStyle={{
            background: colors.card,
            border: `1px solid ${colors.grid}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => `${value}%`}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Pie
          data={rows}
          dataKey="percent"
          nameKey="name"
          innerRadius="52%"
          outerRadius="75%"
          paddingAngle={1}
          label={({ name, percent: p }) => `${name}: ${p}%`}
          labelLine={false}
        >
          {rows.map((row, i) => (
            <Cell
              key={row.name}
              fill={
                TOKEN_COLORS[row.name] ?? TOKEN_FALLBACK[i % TOKEN_FALLBACK.length]
              }
            />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const { tradeFiats } = useTradeMeta()
  const fiatOptions = useMemo(() => resolveFiatOptions(tradeFiats), [tradeFiats])

  const [fiat, setFiat] = useState(DEFAULT_FIAT)
  const [range, setRange] = useState<RangeKey>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [forceTick, setForceTick] = useState(0)
  const forceRef = useRef(false)
  const tz = useMemo(() => currentTimeZone(), [])

  const custom = range === 'custom' ? customRangeToFromTo(customFrom, customTo) : null
  // 自定义范围两端选完才请求（对齐旧版）
  const enabled = range !== 'custom' || custom !== null

  const query = useQuery<DashboardHome, Error, DashboardHome>({
    queryKey: ['dashboard-home', fiat, range, custom?.from ?? '', custom?.to ?? '', forceTick],
    enabled,
    placeholderData: keepPreviousData,
    // 仅对网络/服务端异常重试；业务错误(400)与 403 是确定性失败，重试只会重复弹 toast
    retry: (failureCount, error) => {
      const code = (error as { code?: number }).code
      const retryable = code === undefined || code === 0 || code >= 500
      return retryable && failureCount < 3
    },
    // 对齐旧版 dashboardRetryTimer：1s / 2s / 3s 重试，第 4 次失败后放弃
    retryDelay: (attemptIndex) => (attemptIndex + 1) * 1000,
    queryFn: async ({ queryKey }) => {
      const [, f, r, from, to] = queryKey as [string, string, RangeKey, string, string, number]
      const force = forceRef.current
      forceRef.current = false
      const data = await fetchDashboardHome({
        fiat: f,
        range: r,
        tz,
        from: from || undefined,
        to: to || undefined,
        force,
      })
      if (!data) throw new Error('empty dashboard data')
      return data
    },
  })

  const home = query.data
  const symbol = fiatSymbol(home?.currency ?? fiat)
  const kpi = home?.kpi

  const rangeLabels: Record<RangeKey, string> = {
    today: t('home.range-today'),
    '7d': t('home.range-7d'),
    '30d': t('home.range-30d'),
    custom: t('home.range-custom'),
  }

  const handleRangeChange = (value: string) => {
    setRange(value as RangeKey)
  }

  const kpiCards = kpi
    ? [
        {
          title: t('home.kpi-total'),
          value: String(kpi.orders_total ?? 0),
          subLabel: t('home.kpi-paid-orders'),
          subValue: String(kpi.orders_success ?? 0),
          dotColor: '#4080FF',
        },
        {
          title: t('home.kpi-pending'),
          value: String(kpi.orders_pending ?? 0),
          subLabel: t('home.kpi-confirming'),
          subValue: String(kpi.orders_confirming ?? 0),
          dotColor: '#F5A623',
        },
        {
          title: t('home.kpi-gmv'),
          value: `${symbol}${formatKpiAmount(kpi.gmv_paid)}`,
          subLabel: t('home.kpi-success-rate'),
          subValue: successRatePercent(kpi.order_success_rate),
          dotColor: '#14A058',
        },
        {
          title: t('home.kpi-success'),
          value: String(kpi.orders_success ?? 0),
          subLabel: '',
          subValue: '',
          dotColor: '#14A058',
        },
        {
          title: t('home.kpi-failed'),
          value: String(kpi.orders_failed ?? 0),
          subLabel: t('home.kpi-notify-failed'),
          subValue: String(kpi.notify_failed ?? 0),
          dotColor: '#E33E38',
        },
        {
          title: t('home.kpi-period'),
          value: formatPeriodLabel(home?.from, home?.to),
          subLabel: home?.timezone,
          subValue: ' ',
          dotColor: '#722ED1',
        },
      ]
    : []

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('home.title')}</h1>

      {/* 工具栏 */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <span className="text-sm font-medium text-muted-foreground">
              {t('home.fiat-label')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {fiatOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setFiat(option.value)
                  }}
                  className={cn(
                    'flex min-w-16 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
                    'h-10 md:h-auto md:py-1.5 md:min-w-[60px]',
                    fiat === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-secondary text-foreground hover:border-primary hover:text-primary',
                  )}
                  aria-pressed={fiat === option.value}
                >
                  {option.symbol && (
                    <span className="font-bold">{option.symbol}</span>
                  )}
                  <span>{option.value}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {range === 'custom' && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value)
                  }}
                  aria-label={t('home.custom-from')}
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:h-9"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value)
                  }}
                  aria-label={t('home.custom-to')}
                  className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:h-9"
                />
              </>
            )}
            <div className="w-32">
              <Select value={range} onValueChange={handleRangeChange}>
                <SelectTrigger className="h-10 md:h-9" aria-label={t('home.range-label')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {rangeLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                forceRef.current = true
                setForceTick((v) => v + 1)
              }}
              disabled={query.isFetching || !enabled}
              className="h-10 md:h-9"
            >
              <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
              {t('home.force-refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI 卡片 */}
      {kpi ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((card) => (
            <KpiCard key={card.title} {...card} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex min-h-28 flex-col gap-3 p-4">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 图表 */}
      <div className="flex flex-col gap-4 xl:flex-row">
        <Card className="min-w-0 flex-1">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">{t('home.chart-trend')}</CardTitle>
          </CardHeader>
          <CardContent className="h-80 pt-2">
            <TrendChart points={home?.points ?? []} fiat={home?.currency ?? fiat} />
          </CardContent>
        </Card>
        <Card className="min-w-0 xl:w-[600px]">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">{t('home.chart-share')}</CardTitle>
          </CardHeader>
          <CardContent className="h-80 pt-2">
            <TokenPie tokenMap={home?.token_map ?? {}} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
