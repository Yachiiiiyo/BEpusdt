import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Brand } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { LanguageSwitch } from '@/components/language-switch'
import { useThemeEffect } from '@/components/theme-toggle'
import { useLanguageEffect } from '@/components/language-switch'
import { login, fetchAuthInfo } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { GuestGuard, useRedirectAfterLogin } from '@/router/auth-guard'

const FORGOT_PASSWORD_URL =
  'https://github.com/Yachiiiiyo/BEpusdt/blob/main/docs/faq/login-reset.md'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean(),
})

type LoginForm = z.infer<typeof loginSchema>

function LoginPageInner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const redirectTo = useRedirectAfterLogin()
  const setSession = useAuthStore((s) => s.setSession)
  const rememberedUsername = useAuthStore((s) => s.rememberedUsername)
  const setRememberedUsername = useAuthStore((s) => s.setRememberedUsername)
  const queryClient = useQueryClient()
  const [showPassword, setShowPassword] = useState(false)

  useThemeEffect()
  useLanguageEffect()

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: rememberedUsername ?? '',
      password: '',
      remember: rememberedUsername !== null,
    },
  })

  useEffect(() => {
    // react-hook-form + zod resolver 会异步校验，defaultValues 需同步一次
    setValue('username', rememberedUsername ?? '')
    setValue('remember', rememberedUsername !== null)
  }, [rememberedUsername, setValue])

  const onSubmit = async (values: LoginForm) => {
    try {
      const { token, types } = await login(values.username, values.password)
      setSession(token, types)
      setRememberedUsername(values.remember ? values.username : null)
      // 登录后预取账号信息（供顶栏展示用户名）；此时已带 token
      void queryClient.prefetchQuery({ queryKey: ['auth-info'], queryFn: fetchAuthInfo })
      toast.success(t('login.success'))
      navigate(redirectTo, { replace: true })
    } catch {
      // 错误提示已由请求层 toast 展示，这里只避免未处理的 Promise 异常
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <LanguageSwitch />
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <Brand className="text-2xl" textClassName="text-2xl" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t('login.title')}</CardTitle>
            <CardDescription>{t('login.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">{t('login.username')}</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder={t('login.username-placeholder')}
                  {...register('username')}
                />
                {errors.username && (
                  <p className="text-xs text-destructive" role="alert">
                    {t('login.field-username-required')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{t('login.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('login.password-placeholder')}
                    className="pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('login.hide-password') : t('login.show-password')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive" role="alert">
                    {t('login.field-password-required')}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
                  <Controller
                    control={control}
                    name="remember"
                    render={({ field }) => (
                      <Checkbox
                        id="remember"
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    )}
                  />
                  {t('login.remember-username')}
                </label>
                <a
                  href={FORGOT_PASSWORD_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm"
                >
                  {t('login.forgot-password')}
                </a>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('login.submitting') : t('login.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function LoginPage() {
  return (
    <GuestGuard>
      <LoginPageInner />
    </GuestGuard>
  )
}
