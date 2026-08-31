import { createContext, useContext, useState } from 'react'

const ViewModeContext = createContext(null)

export function ViewModeProvider({ children }) {
  const [mode, setMode] = useState(() =>
    localStorage.getItem('ui_view_mode') === 'desktop' ? 'desktop' : 'mobile'
  )

  const toggleMode = () => {
    setMode(m => {
      const next = m === 'mobile' ? 'desktop' : 'mobile'
      localStorage.setItem('ui_view_mode', next)
      return next
    })
  }

  return (
    <ViewModeContext.Provider value={{ mode, isMobileMode: mode === 'mobile', toggleMode }}>
      {children}
    </ViewModeContext.Provider>
  )
}

export const useViewMode = () => useContext(ViewModeContext)
