/**
 * 安全设置校验（纯函数）。
 *
 * 规则与后端逐条对齐（app/handler/auth/auth.go）：
 * - validateSecure:   空串放行（表示不修改）；必须以 / 开头；长度 8-18；
 *                     匹配 ^/[a-zA-Z0-9]+$（securePathRe）。因字符集仅 ASCII，
 *                     JS 字符长度与 Go 的字节长度一致。
 * - validateNewPassword: 两次输入需一致；长度 >= 6；<= 72 字节（bcrypt 限制）。
 *
 * 返回值为错误码（空串表示通过），文案由页面映射到 i18n。
 */

export type SecureErrorCode = '' | 'prefix' | 'length' | 'charset'
export type NewPasswordErrorCode = '' | 'mismatch' | 'min' | 'max'

/** 对应后端 validateSecure */
export function validateSecure(secure: string): SecureErrorCode {
  if (secure === '') return ''
  if (!secure.startsWith('/')) return 'prefix'
  if (secure.length < 8 || secure.length > 18) return 'length'
  if (!/^\/[a-zA-Z0-9]+$/.test(secure)) return 'charset'
  return ''
}

/** 对应后端 validateNewPassword（change = 是否尝试修改密码） */
export function validateNewPassword(
  newPassword: string,
  confirm: string,
  change: boolean,
): NewPasswordErrorCode {
  if (!change) return ''
  if (newPassword !== confirm) return 'mismatch'
  if (newPassword.length < 6) return 'min'
  if (new TextEncoder().encode(newPassword).length > 72) return 'max'
  return ''
}

/** 两次新密码输入是否构成一次密码修改（与后端 changePassword 判断一致） */
export function isPasswordChange(newPassword: string, confirm: string): boolean {
  return newPassword !== '' || confirm !== ''
}
