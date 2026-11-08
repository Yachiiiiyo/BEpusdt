/**
 * 归集（Sweep）纯函数/映射（不依赖 React / i18n / vite 别名，便于单元测试）
 *
 * 枚举与字段来源：
 * - app/handler/admin/sweep.go：List 请求 { state, address, order_id }（base.ListRequest 带 page/size/sort）
 * - 旧版 Vue 后台（05da72e）web/src/views/sweep/sweep.ts：stateMap 状态集合
 * - app/model/sweep.go：amount 以最小单位保存（BSC USDT 18 位小数）
 */

import type { BadgeVariant } from './order'
import type { SweepListReq } from '../api/sweep'

/** 归集状态 → { i18n key, Badge 配色 }；顺序即筛选项顺序（与旧版一致） */
export const SWEEP_STATES: { value: string; key: string; variant: BadgeVariant }[] = [
  { value: 'pending', key: 'sweep.state-pending', variant: 'secondary' },
  { value: 'funding', key: 'sweep.state-funding', variant: 'default' },
  { value: 'funded', key: 'sweep.state-funded', variant: 'default' },
  { value: 'sweeping', key: 'sweep.state-sweeping', variant: 'warning' },
  { value: 'swept', key: 'sweep.state-swept', variant: 'success' },
  { value: 'done', key: 'sweep.state-done', variant: 'success' },
  { value: 'skipped', key: 'sweep.state-skipped', variant: 'secondary' },
  { value: 'failed', key: 'sweep.state-failed', variant: 'destructive' },
]

/** 状态 → i18n key（未知状态回退展示原值） */
export function sweepStateKey(state: string): string | null {
  return SWEEP_STATES.find((s) => s.value === state)?.key ?? null
}

/** 状态 → Badge 配色（未知状态用 outline） */
export function sweepStateVariant(state: string): BadgeVariant {
  return SWEEP_STATES.find((s) => s.value === state)?.variant ?? 'outline'
}

/** 未知状态的显示文本（回退原值；已知状态走 i18n） */
export function sweepStateFallback(state: string): string {
  return sweepStateKey(state) ? '' : state
}

/** 仅失败状态可重试（与旧版 v-if="record.state === 'failed'" 一致） */
export function canRetrySweep(state: string): boolean {
  return state === 'failed'
}

/** 最小单位（18 位小数）→ USDT 数量字符串；空/非法输入返回空串 */
export function formatSweepAmount(v: string | null | undefined): string {
  if (!v) return ''
  const s = v.replace(/^-/, '')
  if (s === '' || !/^\d+$/.test(s)) return v
  const padded = s.padStart(19, '0')
  const intPart = padded.slice(0, padded.length - 18).replace(/^0+(?=\d)/, '')
  const frac = padded.slice(padded.length - 18).replace(/0+$/, '')
  return frac ? `${intPart}.${frac}` : intPart
}

/** 筛选输入（空串表示未填） */
export interface SweepFilterInput {
  state: string
  address: string
  order_id: string
}

/** 组装 /api/sweep/list 请求体（page/size/sort 与旧版一致，空筛选项不发） */
export function buildSweepListReq(
  page: number,
  size: number,
  sort: string,
  filters: SweepFilterInput,
): SweepListReq {
  return {
    page,
    size,
    sort,
    state: filters.state ?? '',
    address: (filters.address ?? '').trim(),
    order_id: (filters.order_id ?? '').trim(),
  }
}
