import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
export type Language = 'zh-CN' | 'en-US'

interface UiState {
  theme: Theme
  language: Language
  sidebarCollapsed: boolean
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'zh-CN',
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'bepusdt-ui' },
  ),
)

/** 解析 localStorage 中保存的偏好（供首屏内联脚本之外的模块使用） */
export function readPersistedUi(): { theme?: Theme; language?: Language } {
  try {
    const raw = localStorage.getItem('bepusdt-ui')
    if (!raw) return {}
    const state = (JSON.parse(raw) as { state?: { theme?: Theme; language?: Language } }).state
    return { theme: state?.theme, language: state?.language }
  } catch {
    return {}
  }
}

export function resolveInitialLanguage(): Language {
  const saved = readPersistedUi().language
  if (saved === 'zh-CN' || saved === 'en-US') return saved
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function resolveInitialTheme(): Theme {
  const saved = readPersistedUi().theme
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}
