import { Moon, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/store/useSessionStore'

/** Keeps the `dark` class on <html> in sync with the saved theme. */
export function useThemeClass() {
  const theme = useSessionStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
}

/** Light/dark switch in the top-right corner; scrolls away with the page so it never covers content. */
export function ThemeToggle() {
  const theme = useSessionStore((s) => s.theme)
  const setTheme = useSessionStore((s) => s.setTheme)
  const dark = theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      data-testid="theme-toggle"
      aria-label={dark ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="absolute top-4 right-4 z-40"
    >
      {dark ? <Sun className="size-5" strokeWidth={1.75} aria-hidden /> : <Moon className="size-5" strokeWidth={1.75} aria-hidden />}
    </Button>
  )
}
