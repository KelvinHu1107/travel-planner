import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

function safeRead(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function safeWrite(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => safeRead('app-theme', 'handdrawn'))

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    // Force repaint on some WebView environments (LINE iOS etc.)
    root.style.setProperty('--theme-tick', theme === 'handdrawn' ? '1' : '0')
    safeWrite('app-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'handdrawn' ? 'cute' : 'handdrawn')

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
