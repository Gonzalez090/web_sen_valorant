import { lazy, Suspense } from 'react'
import { isFinished } from './lib/session'
import { Setup } from './pages/Setup'
import { useSessionStore } from './store/useSessionStore'
import { C } from './ui/styles'

// three.js and recharts are large; load each only when its page is shown.
const Test = lazy(() => import('./pages/Test').then((m) => ({ default: m.Test })))
const Results = lazy(() => import('./pages/Results').then((m) => ({ default: m.Results })))

export default function App() {
  const view = useSessionStore((s) => s.view)
  const session = useSessionStore((s) => s.session)
  if (view === 'setup' || !session) return <Setup />
  return <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: C.bg }} />}>{isFinished(session) ? <Results /> : <Test />}</Suspense>
}
