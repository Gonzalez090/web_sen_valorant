import { cn } from '@/lib/utils'

interface ProgressProps {
  /** 0–1. */
  value: number
  className?: string
  'data-testid'?: string
  'aria-label'?: string
}

/** Thin progress bar. */
export function Progress({ value, className, ...props }: ProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cn('h-1 overflow-hidden bg-fg/10', className)} {...props}>
      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}
