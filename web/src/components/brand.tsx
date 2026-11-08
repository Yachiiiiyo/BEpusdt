import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-6 shrink-0', className)}
      viewBox="0 0 26 26"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="24" height="24" rx="7" fill="#F38020" />
      <path
        d="M15.5 6.5 8.5 14h3.6l-1.6 5.5 7-7.5h-3.6l1.6-5.5z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export function Brand({
  className,
  textClassName,
}: {
  className?: string
  textClassName?: string
}) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold', className)}>
      <BrandMark />
      <span className={cn('text-base', textClassName)}>BEpusdt</span>
    </span>
  )
}
