import {
  Home,
  Wallet,
  ReceiptText,
  FilePlus2,
  LineChart,
  ScrollText,
  SlidersHorizontal,
  History,
  Settings2,
  Server,
  BookOpen,
  type LucideIcon,
} from 'lucide-react'

export interface MenuLeaf {
  path: string
  titleKey: string
  icon: LucideIcon
}

export interface MenuGroup {
  path: string
  titleKey: string
  icon: LucideIcon
  children: MenuLeaf[]
}

export type MenuEntry = MenuLeaf | MenuGroup

export function isMenuGroup(entry: MenuEntry): entry is MenuGroup {
  return 'children' in entry
}

/** 侧栏菜单（前端写死，与后端 Menu 一一对应） */
export const menu: MenuEntry[] = [
  { path: '/home', titleKey: 'menu.home', icon: Home },
  { path: '/wallet', titleKey: 'menu.wallet', icon: Wallet },
  { path: '/order', titleKey: 'menu.order', icon: ReceiptText },
  { path: '/create-order', titleKey: 'menu.create-order', icon: FilePlus2 },
  {
    path: '/rate',
    titleKey: 'menu.rate',
    icon: LineChart,
    children: [
      { path: '/rate/list', titleKey: 'menu.rate-list', icon: ScrollText },
      { path: '/rate/syntax', titleKey: 'menu.rate-syntax', icon: SlidersHorizontal },
    ],
  },
  { path: '/sweep', titleKey: 'menu.sweep', icon: History },
  {
    path: '/system',
    titleKey: 'menu.system',
    icon: Settings2,
    children: [
      { path: '/system/base/base', titleKey: 'menu.system-base', icon: Settings2 },
      { path: '/system/rpc/rpc', titleKey: 'menu.system-rpc', icon: Server },
    ],
  },
  { path: '/github-api-doc', titleKey: 'menu.github-api-doc', icon: BookOpen },
]

/** 根据路径查找面包屑（i18n key 列表） */
export function findBreadcrumb(pathname: string): string[] {
  for (const entry of menu) {
    if (isMenuGroup(entry)) {
      for (const child of entry.children) {
        if (child.path === pathname) {
          return [entry.titleKey, child.titleKey]
        }
      }
    } else if (entry.path === pathname) {
      return [entry.titleKey]
    }
  }
  if (pathname.startsWith('/home')) return ['menu.home']
  return []
}
