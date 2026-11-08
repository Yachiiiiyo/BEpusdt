import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from '@/locales/zh-CN.json'
import enUS from '@/locales/en-US.json'
import { resolveInitialLanguage } from '@/stores/ui'

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const
export const DEFAULT_LANGUAGE = 'zh-CN'

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

export default i18n
