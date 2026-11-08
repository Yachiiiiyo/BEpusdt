import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text),
    )
  }
  return Promise.resolve(fallbackCopy(text))
}

function fallbackCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/** 点击复制文本，成功/失败用 toast 提示（i18n） */
export function CopyButton({
  text,
  className,
  size = 'icon',
  variant = 'ghost',
  iconClassName = 'size-3.5',
}: {
  text: string
  className?: string
  /** 图标尺寸，默认 size-3.5 */
  iconClassName?: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn('size-8', className)}
      title={t('common.copy')}
      onClick={async () => {
        const ok = await copyText(text)
        if (ok) {
          setCopied(true)
          toast.success(t('common.copy-success'))
          setTimeout(() => setCopied(false), 1500)
        } else {
          toast.error(t('common.copy-failed'))
        }
      }}
    >
      {copied ? <Check className={iconClassName} /> : <Copy className={iconClassName} />}
      <span className="sr-only">{t('common.copy')}</span>
    </Button>
  )
}
