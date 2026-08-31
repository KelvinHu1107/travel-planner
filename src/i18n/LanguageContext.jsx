import { createContext, useContext, useState } from 'react'
import zh from './zh'
import en from './en'

const TRANSLATIONS = { zh, en }
const STORAGE_KEY = 'ui_language'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'en' ? 'en' : 'zh'
  })

  const setLang = (l) => {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }

  const t = (key, vars = {}) => {
    const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.zh
    const str = dict[key] ?? TRANSLATIONS.zh[key] ?? key
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
