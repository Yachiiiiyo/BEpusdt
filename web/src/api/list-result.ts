import type { ApiResponse } from './types'

/**
 * 从通过业务校验的响应中提取列表结果（纯函数，便于单元测试）。
 * 后端约定：列表接口把 data 与顶层 total 一起返回。
 */
export function toListResult<T>(res: ApiResponse<T>): {
  data: T
  total: number
} {
  // Go 的空切片可能序列化为 null，omitempty 下字段也可能整个缺失：
  // T 是数组类型时一律兜底成 []，避免页面 .map 崩溃。
  const raw = res.data as unknown
  const data = (raw === null || raw === undefined ? [] : raw) as T
  return { data, total: res.total ?? 0 }
}
