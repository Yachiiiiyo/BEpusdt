import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAuthInfo } from '@/api/auth'
import { useUiStore } from '@/stores/ui'
import { useThemeEffect } from '@/components/theme-toggle'
import { useLanguageEffect } from '@/components/language-switch'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

export function AppLayout({ children }: { children: ReactNode }) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  useThemeEffect()
  useLanguageEffect()

  // 登录后校验 token：失败且 403 时请求层会清理登录态并跳转登录页
  useQuery({
    queryKey: ['auth-info'],
    queryFn: fetchAuthInfo,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="w-full min-w-0">{children}</div>
        </main>
      </div>
    </div>
  )
}
