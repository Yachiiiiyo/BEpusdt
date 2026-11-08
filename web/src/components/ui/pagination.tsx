import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { totalPages, pageWindow } from '@/lib/pagination'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface PaginationProps {
  /** 当前页，从 1 开始 */
  page: number
  /** 每页条数 */
  size: number
  /** 总条数 */
  total: number
  /** 可选的每页条数选项，默认 [10, 20, 50, 100] */
  sizeOptions?: number[]
  className?: string
  onPageChange: (page: number) => void
  onSizeChange: (size: number) => void
}

export function Pagination({
  page,
  size,
  total,
  sizeOptions = [10, 20, 50, 100],
  className,
  onPageChange,
  onSizeChange,
}: PaginationProps) {
  const { t } = useTranslation()
  const pages = totalPages(total, size)

  return (
    <div
      data-slot="pagination"
      className={cn(
        'flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between',
        className,
      )}
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{t('pagination.total', { total })}</span>
        <Select
          value={String(size)}
          onValueChange={(v) => onSizeChange(Number(v))}
        >
          <SelectTrigger className="h-8 w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizeOptions.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {t('pagination.size-option', { size: s })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('pagination.prev')}
        >
          <ChevronLeft />
        </Button>
        {pageWindow(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('pagination.next')}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
