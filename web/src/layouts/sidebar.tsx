import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { menu, isMenuGroup } from '@/router/routes'
import { Brand } from '@/components/brand'
import { cn } from '@/lib/utils'

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const active = menu
      .filter(isMenuGroup)
      .find((g) => g.children.some((c) => c.path === location.pathname))
    return active ? [active.path] : ['/rate', '/system']
  })

  const toggleGroup = (path: string) => {
    setOpenGroups((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    )
  }

  const renderLink = (path: string, titleKey: string, Icon: typeof ChevronDown) => (
    <NavLink
      to={path}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          isActive && 'bg-accent text-accent-foreground font-medium',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{t(titleKey)}</span>}
    </NavLink>
  )

  return (
    <nav
      aria-label="Main navigation"
      className={cn('flex h-full flex-col gap-1 p-2', collapsed && 'px-1.5')}
    >
      {menu.map((entry) => {
        if (!isMenuGroup(entry)) {
          return (
            <div key={entry.path} title={collapsed ? t(entry.titleKey) : undefined}>
              {renderLink(entry.path, entry.titleKey, entry.icon)}
            </div>
          )
        }

        const isChildActive = entry.children.some((c) => c.path === location.pathname)
        const isOpen = openGroups.includes(entry.path)

        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() => toggleGroup(entry.path)}
              aria-expanded={isOpen}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                isChildActive && 'text-foreground',
              )}
            >
              <entry.icon className="size-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-left">{t(entry.titleKey)}</span>
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </>
              )}
            </button>
            {isOpen && !collapsed && (
              <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                {entry.children.map((child) => (
                  <div key={child.path}>{renderLink(child.path, child.titleKey, child.icon)}</div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-border bg-card md:flex md:w-60',
        collapsed && 'md:w-14',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-border px-4', collapsed && 'justify-center px-0')}>
        <Brand textClassName={cn(collapsed && 'sr-only')} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav collapsed={collapsed} />
      </div>
    </aside>
  )
}
