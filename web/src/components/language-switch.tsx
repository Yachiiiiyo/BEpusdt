import { useEffect } from 'react'
import { Languages, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUiStore } from '@/stores/ui'
import { cn } from '@/lib/utils'

const LANGUAGES = ['zh-CN', 'en-US'] as const

export function useLanguageEffect() {
  const language = useUiStore((s) => s.language)
  useEffect(() => {
    void import('@/i18n').then(({ default: i18n }) => {
      void i18n.changeLanguage(language)
      document.documentElement.lang = language
    })
  }, [language])
}

export function LanguageSwitch() {
  const { t } = useTranslation()
  const language = useUiStore((s) => s.language)
  const setLanguage = useUiStore((s) => s.setLanguage)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('layout.language')}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => setLanguage(lang)}
            className={cn(language === lang && 'bg-secondary')}
          >
            <Check className={cn('size-4', language !== lang && 'invisible')} />
            {t(`system.${lang}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
