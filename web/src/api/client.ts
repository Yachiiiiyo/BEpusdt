import { toast } from 'sonner'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { classifyForbidden } from './errors'
import { toListResult } from './list-result'
import type { ApiResponse } from './types'

/** 业务失败时 reject 的错误对象 */
export class ApiError extends Error {
  code: number
  msg: string

  constructor(code: number, msg: string) {
    super(msg)
    this.name = 'ApiError'
    this.code = code
    this.msg = msg
  }
}

const TOKEN_STORAGE_KEY = 'bepusdt-auth'

function redirectLogin(withMessage?: 'session' | 'token') {
  const basePath = window.location.pathname.split('#')[0]
  if (withMessage === 'session') {
    toast.error(i18n.t('error.secure-entry-required'))
  } else if (withMessage === 'token') {
    toast.error(i18n.t('error.token-expired'))
  }
  window.location.href = `${basePath}#/login`
}

/** 统一响应处理（纯逻辑部分，便于测试）：校验 code，返回原始响应 */
export function assertApiResponse<T>(res: ApiResponse<T>): ApiResponse<T> {
  if (res.code === 200) {
    return res
  }
  if (res.code === 403) {
    const reason = classifyForbidden(res.msg)
    if (reason === 'session') {
      useAuthStore.getState().clear()
      redirectLogin('session')
    } else {
      // token 过期 / 无效
      useAuthStore.getState().clear()
      redirectLogin('token')
    }
    throw new ApiError(res.code, res.msg ?? '')
  }
  if (res.code === 404) {
    toast.error(i18n.t('error.request-timeout'))
    throw new ApiError(res.code, res.msg ?? '')
  }
  // 400 及其它非 200：直接展示后端 msg
  toast.error(res.msg || i18n.t('error.request-failed'))
  throw new ApiError(res.code, res.msg ?? '')
}

/** 兼容旧导出：返回 res.data */
export function handleBusinessCode(res: ApiResponse): unknown {
  return assertApiResponse(res).data
}

async function request<T>(
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    // 后端约定：Authorization 头原样携带 token，无 Bearer 前缀
    headers['Authorization'] = token
  }

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    toast.error(i18n.t('error.network-error'))
    throw new ApiError(0, i18n.t('error.network-error'))
  }

  // HTTP 403 与业务 403 同规则处理
  if (res.status === 403) {
    let msg = ''
    try {
      const data = (await res.json()) as ApiResponse
      msg = data.msg ?? ''
    } catch {
      /* ignore */
    }
    const reason = classifyForbidden(msg)
    useAuthStore.getState().clear()
    redirectLogin(reason === 'session' ? 'session' : 'token')
    throw new ApiError(403, msg)
  }

  if (res.status !== 200) {
    const text = i18n.t('error.server-error')
    toast.error(text)
    throw new ApiError(res.status, text)
  }

  const data = (await res.json()) as ApiResponse<T>
  return assertApiResponse<T>(data)
}

export function get<T>(url: string): Promise<T> {
  return request<T>('GET', url).then((res) => res.data as T)
}

export function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>('POST', url, body).then((res) => res.data as T)
}

/** 成功信息也在 msg 里的接口（如通知测试）：返回后端 msg */
export function postMsg(url: string, body?: unknown): Promise<string> {
  return request<unknown>('POST', url, body).then((res) => res.msg ?? '')
}

/** 列表接口：返回 { data, total }（复用同一套 403/错误处理） */
export function postWithTotal<T>(
  url: string,
  body?: unknown,
): Promise<{ data: T; total: number }> {
  return request<T>('POST', url, body).then((res) => toListResult<T>(res))
}

/** 兼容 旧 store key（仅用于清理历史遗留，不读取任何凭据内容） */
export function legacyTokenKey() {
  return TOKEN_STORAGE_KEY
}
