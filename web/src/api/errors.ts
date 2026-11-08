/**
 * 403 响应分类（纯函数，供请求层与测试使用）
 */
export type ForbiddenReason = 'session' | 'token' | 'unknown'

const SESSION_MSG = 'unauthorized access'
const TOKEN_MSGS = [
  'token expired, please login again',
  'missing authorization token',
  'invalid authorization token',
]

export function classifyForbidden(msg: string | undefined): ForbiddenReason {
  const m = (msg ?? '').trim().toLowerCase()
  if (m === SESSION_MSG) return 'session'
  if (TOKEN_MSGS.includes(m)) return 'token'
  return 'unknown'
}
