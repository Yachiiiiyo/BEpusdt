import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  /** 登录令牌（仅保存在内存与 localStorage，绝不打印） */
  token: string | null
  /** 登录接口返回的 types，本轮暂未使用，先存内存字段 */
  types: number[]
  /** 记住账号（仅用户名，不含密码） */
  rememberedUsername: string | null
  setSession: (token: string, types: number[]) => void
  setRememberedUsername: (username: string | null) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      types: [],
      rememberedUsername: null,
      setSession: (token, types) => set({ token, types }),
      setRememberedUsername: (rememberedUsername) => set({ rememberedUsername }),
      clear: () => set({ token: null, types: [] }),
    }),
    {
      name: 'bepusdt-auth',
      partialize: (s) => ({ token: s.token, rememberedUsername: s.rememberedUsername }),
    },
  ),
)
