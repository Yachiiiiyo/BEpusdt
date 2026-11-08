import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 简单旋转加载指示，用于按钮内 */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />
}
