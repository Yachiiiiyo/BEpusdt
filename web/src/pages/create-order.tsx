import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ExternalLink, ListOrdered, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CopyButton } from '@/components/copy-button'
import { useTradeMeta } from '@/hooks/use-trade-meta'
import { createOrder } from '@/api/order'
import { buildCreateOrderReq, generateOrderId } from '@/lib/create-order'
import { cn } from '@/lib/utils'

/** zod 校验规则对齐旧版 rules 与 Go binding（createReq） */
const schema = z.object({
  name: z.string().trim().min(3, 'createOrder.error-name'),
  order_id: z.string().trim().min(1, 'createOrder.error-order-id'),
  amount: z
    .number({ invalid_type_error: 'createOrder.error-amount' })
    .min(1, 'createOrder.error-amount')
    .max(99999999, 'createOrder.error-amount'),
  fiat: z.string().min(1, 'createOrder.error-fiat'),
  crypto: z.array(z.string()),
  timeoutHours: z.number().int().min(1).max(3),
})

type FormValues = z.infer<typeof schema>

const TIMEOUT_OPTIONS = [1, 2, 3]

type CreateResult =
  | { ok: true; paymentUrl: string }
  | { ok: false; message: string }

export default function CreateOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tradeFiats, tradeCryptos } = useTradeMeta()
  const [result, setResult] = useState<CreateResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      order_id: generateOrderId(),
      amount: 0,
      fiat: '',
      crypto: [],
      timeoutHours: 1,
    },
  })

  const cryptoOptions = useMemo(
    () => (Array.isArray(tradeCryptos) ? tradeCryptos : []),
    [tradeCryptos],
  )

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const data = await createOrder(buildCreateOrderReq(values))
      setResult({ ok: true, paymentUrl: data.payment_url ?? '' })
    } catch (err) {
      // 业务失败已由请求层 toast 后端 msg；此处补一个结果面板展示错误
      const message = err instanceof Error && err.message ? err.message : t('createOrder.failed')
      setResult({ ok: false, message })
    } finally {
      setSubmitting(false)
    }
  })

  const onReset = () => {
    setResult(null)
    reset({
      name: '',
      order_id: generateOrderId(),
      amount: 0,
      fiat: '',
      crypto: [],
      timeoutHours: 1,
    })
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t('createOrder.title')}</h1>
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold">
                {result.ok ? t('createOrder.result-success') : t('createOrder.result-failed')}
              </p>
              <p className="text-sm text-muted-foreground">
                {result.ok ? t('createOrder.result-success-desc') : result.message}
              </p>
            </div>
          {result.ok && (
            <>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3">
                <a
                  href={result.paymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 break-all text-sm font-medium text-primary hover:underline"
                >
                  {result.paymentUrl}
                </a>
                <CopyButton text={result.paymentUrl} />
                <Button asChild size="icon" variant="ghost" className="size-8">
                  <a href={result.paymentUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" />
                    <span className="sr-only">{t('createOrder.open-link')}</span>
                  </a>
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">{t('createOrder.tips')}</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t('createOrder.tip-send')}</li>
                  <li>{t('createOrder.tip-expire')}</li>
                </ul>
              </div>
            </>
          )}
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/order')}>
            <ListOrdered className="size-4" />
            {t('createOrder.goto-list')}
          </Button>
          <Button variant="outline" onClick={onReset}>
            <RotateCcw className="size-4" />
            {t('createOrder.create-again')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t('createOrder.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('createOrder.desc')}</p>
      </div>
      <Card>
        <CardContent className="p-4">
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={onSubmit}
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="co-name">{t('createOrder.label-name')}</Label>
              <Input
                id="co-name"
                placeholder={t('createOrder.ph-name')}
                autoComplete="off"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{t(errors.name.message ?? '')}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="co-order-id">{t('createOrder.label-order-id')}</Label>
              <Input
                id="co-order-id"
                placeholder={t('createOrder.ph-order-id')}
                autoComplete="off"
                {...register('order_id')}
              />
              {errors.order_id && (
                <p className="text-xs text-destructive">{t(errors.order_id.message ?? '')}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="co-amount">{t('createOrder.label-amount')}</Label>
              <Input
                id="co-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="1"
                placeholder={t('createOrder.ph-amount')}
                {...register('amount', { valueAsNumber: true })}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{t(errors.amount.message ?? '')}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t('createOrder.label-fiat')}</Label>
              <Controller
                control={control}
                name="fiat"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label={t('createOrder.label-fiat')}>
                      <SelectValue placeholder={t('createOrder.ph-fiat')} />
                    </SelectTrigger>
                    <SelectContent>
                      {tradeFiats.map((fiat) => (
                        <SelectItem key={fiat} value={fiat}>
                          {fiat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.fiat && (
                <p className="text-xs text-destructive">{t(errors.fiat.message ?? '')}</p>
              )}
            </div>

            {cryptoOptions.length > 0 && (
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label>{t('createOrder.label-crypto')}</Label>
                <Controller
                  control={control}
                  name="crypto"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {cryptoOptions.map((c) => {
                        const selected = field.value.includes(c)
                        return (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              field.onChange(
                                selected
                                  ? field.value.filter((v) => v !== c)
                                  : [...field.value, c],
                              )
                            }}
                            className={cn(
                              'min-h-10 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                              selected
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-input bg-card text-foreground hover:bg-muted',
                            )}
                          >
                            {c}
                          </button>
                        )
                      })}
                    </div>
                  )}
                />
                <p className="text-xs text-muted-foreground">{t('createOrder.hint-crypto')}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>{t('createOrder.label-timeout')}</Label>
              <Controller
                control={control}
                name="timeoutHours"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger aria-label={t('createOrder.label-timeout')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEOUT_OPTIONS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {t('createOrder.timeout-hours', { hours: h })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={submitting} className="min-h-10">
                {submitting ? t('createOrder.submitting') : t('createOrder.submit')}
              </Button>
              <Button type="button" variant="outline" className="min-h-10" onClick={onReset}>
                {t('createOrder.reset')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
