import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PanelLeft, Menu, ExternalLink, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme-toggle'
import { LanguageSwitch } from '@/components/language-switch'
import { SidebarNav } from './sidebar'
import { findBreadcrumb } from '@/router/routes'
import { fetchAuthInfo, logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const GITHUB_URL = 'https://github.com/Yachiiiiyo/BEpusdt'

export function Topbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const clearAuth = useAuthStore((s) => s.clear)
  const pathname = window.location.hash.replace(/^#/, '') || '/home'

  const { data: info } = useQuery({
    queryKey: ['auth-info'],
    queryFn: fetchAuthInfo,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      // 无论接口成功与否都清理本地登录态
      clearAuth()
      navigate('/login', { replace: true })
    },
  })

  const breadcrumbKeys = findBreadcrumb(pathname)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 md:px-4">
      {/* 移动端菜单 */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('layout.open-menu')}>
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="h-14 justify-center border-b border-border">
            <SheetTitle className="flex items-center justify-center">
              <span className="flex items-center gap-2 text-base font-semibold">
                <svg className="size-6" viewBox="0 0 26 26" aria-hidden="true">
                  <rect x="1" y="1" width="24" height="24" rx="7" fill="#F38020" />
                  <path
                    d="M15.5 6.5 8.5 14h3.6l-1.6 5.5 7-7.5h-3.6l1.6-5.5z"
                    fill="#FFFFFF"
                  />
                </svg>
                BEpusdt
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto">
            <SidebarNav collapsed={false} onNavigate={undefined} />
          </div>
        </SheetContent>
      </Sheet>

      {/* 桌面端折叠按钮 */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? t('layout.expand-sidebar') : t('layout.toggle-sidebar')}
      >
        <PanelLeft className="size-4" />
      </Button>

      {/* 面包屑 */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground sm:flex">
        {breadcrumbKeys.map((key, i) => (
          <span key={key} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">/</span>}
            <span className={i === breadcrumbKeys.length - 1 ? 'text-foreground' : undefined}>
              {t(key)}
            </span>
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <LanguageSwitch />
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2" aria-label={t('layout.user-menu')}>
              <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {(info?.admin_username ?? 'A').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-32 truncate text-sm sm:inline">
                {info?.admin_username ?? '—'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="truncate">
              {info?.admin_username ?? '—'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="size-4" />
                {t('system.project-address')}
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="size-4" />
              {t('system.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
