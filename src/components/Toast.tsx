import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const TOAST_MS = 2000

/** One short message at the bottom of the screen. Returns the element to render and a `show` function. */
export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), TOAST_MS)
  }, [])

  const node = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg}
            role="status"
            data-testid="toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm shadow-lg"
          >
            <CheckCircle2 className="size-4 text-good" strokeWidth={2} aria-hidden />
            {msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
  return [node, show]
}
