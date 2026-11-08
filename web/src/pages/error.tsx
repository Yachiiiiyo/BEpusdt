import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { FileQuestion, ShieldX, Unplug, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export type ErrorKind = '401' | '404' | '500'

const ICONS: Record<ErrorKind, LucideIcon> = {
  '401': ShieldX,
  '404': FileQuestion,
  '500': Unplug,
}

/** 401/404/500 通用错误页 */
export function ErrorPage({ kind }: { kind: ErrorKind }) {
  const { t } = useTranslation()
  const Icon = ICONS[kind]

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-muted">
            <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <CardTitle className="text-5xl font-bold tracking-tight">
            {kind}
          </CardTitle>
          <CardDescription>{t(`error.${kind}-desc`)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild className="min-h-10">
            <Link to="/home">{t('error.back-home')}</Link>
          </Button>
          <Button
            variant="outline"
            className="min-h-10"
            onClick={() => window.location.reload()}
          >
            {t('error.reload')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
