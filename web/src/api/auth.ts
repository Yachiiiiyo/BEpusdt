import { get, post } from './client'
import type { AuthInfo, LoginResult } from './types'

/** POST /api/auth/set_password（authPasswordReq） */
export interface SetPasswordReq {
  password: string
  new_password: string
  confirm_password: string
}

/** POST /api/auth/security（authSecurityReq，参考旧版 security.vue） */
export interface SecurityReq {
  admin_secure?: string
  admin_username?: string
  password: string
  new_password?: string
  confirm_password?: string
}

export interface SecurityResult {
  /** 修改密码后 token 失效，需要重新登录 */
  relogin: boolean
}

export function login(username: string, password: string): Promise<LoginResult> {
  return post<LoginResult>('/api/auth/login', { username, password })
}

export function logout(): Promise<void> {
  return post<void>('/api/auth/logout')
}

export function fetchAuthInfo(): Promise<AuthInfo> {
  return get<AuthInfo>('/api/auth/info')
}

/** 修改登录密码（返回 relogin 时需引导重新登录；无变更时无 data） */
export function setPassword(
  req: SetPasswordReq,
): Promise<SecurityResult | undefined> {
  return post<SecurityResult | undefined>('/api/auth/set_password', req)
}

/** 修改安全入口/管理账号（危险操作，调用方需确认框） */
export function setSecurity(req: SecurityReq): Promise<SecurityResult> {
  return post<SecurityResult>('/api/auth/security', req)
}
