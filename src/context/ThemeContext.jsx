import { useEffect, useState } from 'react'
import { ThemeContext } from './theme-context'

// Sable is dark only (#220 G). The context now carries just the text size. A
// device that stored a light theme earlier simply renders dark; drop the stale key.

export function ThemeProvider({ children }) {
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem('tattoo_font') || 'normal'
  )

  useEffect(() => {
    localStorage.removeItem('tattoo_theme')
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-font', fontSize === 'large' ? 'large' : '')
    localStorage.setItem('tattoo_font', fontSize)
  }, [fontSize])

  const toggleFont = () => setFontSize(f => (f === 'normal' ? 'large' : 'normal'))

  return (
    <ThemeContext.Provider value={{ fontSize, toggleFont }}>
      {children}
    </ThemeContext.Provider>
  )
}
