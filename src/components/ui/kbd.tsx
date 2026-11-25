import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-line-strong px-1.5 font-sans text-xs text-muted">{children}</kbd>
}
