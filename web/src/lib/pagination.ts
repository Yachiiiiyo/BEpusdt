/** 分页纯函数（不依赖 React/i18n，便于单元测试） */

/** 计算总页数（size 非法时为 0） */
export function totalPages(total: number, size: number): number {
  if (size <= 0) return 0
  return Math.max(1, Math.ceil(total / size))
}

/** 生成页码按钮列表：首页、尾页、当前页附近，'…' 表示省略号 */
export function pageWindow(page: number, pages: number, side = 1): (number | '…')[] {
  if (pages <= 0) return []
  const items = new Set<number>([1, pages, page])
  for (let i = 1; i <= side; i++) {
    items.add(page - i)
    items.add(page + i)
  }
  const sorted = [...items].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}
