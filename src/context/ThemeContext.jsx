import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('tattoo_theme') || 'dark'
  )
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem('tattoo_font') || 'normal'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '')
    localStorage.setItem('tattoo_theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-font', fontSize === 'large' ? 'large' : '')
    localStorage.setItem('tattoo_font', fontSize)
  }, [fontSize])

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  const toggleFont = () => setFontSize(f => (f === 'normal' ? 'large' : 'normal'))

  return (
    <ThemeContext.Provider value={{ theme, toggle, fontSize, toggleFont }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
