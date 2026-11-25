import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeToggle, useThemeClass } from './components/ThemeToggle'
import { TooltipProvider } from './components/ui/tooltip'
import { isFinished } from './lib/session'
import { Setup } from './pages/Setup'
import { useSessionStore } from './store/useSessionStore'

// three.js and recharts are large; load each only when its page is shown.
const Test = lazy(() => import('./pages/Test').then((m) => ({ default: m.Test })))
const Results = lazy(() => import('./pages/Results').then((m) => ({ default: m.Results })))

export default function App() {
  useThemeClass()
  const view = useSessionStore((s) => s.view)
  const session = useSessionStore((s) => s.session)
  const exitToSetup = useSessionStore((s) => s.exitToSetup)
  const page = view === 'setup' || !session ? 'setup' : isFinished(session) ? 'results' : 'test'

  // Pages get the session as a prop, never from the store: while a page fades out, AnimatePresence
  // keeps rendering it with its last props, so a reset (session -> null) can't reach it.
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={150}>
        {page !== 'test' && <ThemeToggle />}
        <ErrorBoundary onReset={exitToSetup}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={page} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              <Suspense fallback={<div className="fixed inset-0 bg-bg" />}>
                {page === 'setup' || !session ? <Setup /> : page === 'results' ? <Results session={session} /> : <Test session={session} />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </TooltipProvider>
    </MotionConfig>
  )
}
