import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuthStore } from '@/stores/auth'

/**
 * 登录守卫：
 * - 无 token 访问非 /login → 跳 /login（记录 redirect）
 * - 有 token 访问受保护路由 → 渲染；token 有效性由 /api/auth/info 校验（见 AppLayout）
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const location = useLocation()

  if (!token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return <>{children}</>
}

/** 登录页守卫：已登录访问 /login 直接进首页 */
export function GuestGuard({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (token) {
    return <Navigate to="/home" replace />
  }
  return <>{children}</>
}

/** 记录登录后的回跳地址 */
export function useRedirectAfterLogin(): string {
  const location = useLocation()
  return (location.state as { from?: string } | null)?.from ?? '/home'
}

/** 副作用：token 变化时校验（在 AppLayout 内调用 /api/auth/info） */
export function useTokenSync() {
  const token = useAuthStore((s) => s.token)
  useEffect(() => {
    // 仅用于在 token 清空后确保离开受保护页面（守卫会处理重定向）
    void token
  }, [token])
}
