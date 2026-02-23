// App.tsx
// Root component. Routes between the chat view and the admin panel.
// Manages the light/dark theme: toggles the 'dark' class on <html> and persists to localStorage.

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ChatWindow } from './components/ChatWindow'
import { AdminPage } from './components/AdminPage'

const THEME_KEY = 'theme'

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored) return stored === 'dark'
    // Default to the user's OS preference on first visit
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Apply the 'dark' class to <html> so Tailwind's dark: variants activate globally
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  /**
   * Toggles between light and dark theme.
   */
  function ToggleTheme() {
    setIsDark((prev) => !prev)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatWindow isDark={isDark} onToggleTheme={ToggleTheme} />} />
        <Route path="/admin" element={<AdminPage isDark={isDark} onToggleTheme={ToggleTheme} />} />
      </Routes>
    </BrowserRouter>
  )
}
