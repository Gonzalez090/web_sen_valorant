import type { RefObject } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface HudProps {
  /** "รอบ 3/7 · เซนส์ A" or the warm-up label. */
  label: string
  /** Rounds total / done, for the dot stepper; omitted during warm-up. */
  rounds?: { total: number; done: number }
  /** Drill progress, e.g. "เป้า 4/12" or "12 วิ". */
  drillText: string | null
  /** Session progress 0–1. */
  progress: number
  fpsRef: RefObject<HTMLSpanElement>
  fpsLow: boolean
}

/** Round stepper (●●●○○○○): done rounds in accent, the current one in white. */
export function RoundDots({ total, done, testId, className }: { total: number; done: number; testId?: string; className?: string }) {
  return (
    <div data-testid={testId} role="img" aria-label={`รอบ ${Math.min(done + 1, total)} จาก ${total}`} className={cn('flex gap-1', className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('size-1.5 rounded-full', i < done ? 'bg-accent' : i === done ? 'bg-fg' : 'bg-fg/20')} />
      ))}
    </div>
  )
}

/** Thin, translucent edge HUD; nothing near the crosshair and nothing animated. */
export function Hud({ label, rounds, drillText, progress, fpsRef, fpsLow }: HudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 text-[13px] tabular-nums">
      <Progress data-testid="hud-progress" aria-label="ความคืบหน้าทั้งหมด" value={progress} className="absolute inset-x-0 top-0 h-0.5 bg-white/5 [&>div]:opacity-80" />

      <div className="absolute top-3.5 left-4 text-fg/75">
        <div data-testid="hud-label">{label}</div>
        {rounds && <RoundDots {...rounds} testId="hud-stepper" className="mt-1.5" />}
      </div>

      <div className="absolute top-3.5 right-4 text-right text-fg/75">
        {drillText && <div data-testid="hud-drill">{drillText}</div>}
        <div className={cn('mt-1 text-[11px] opacity-80', fpsLow ? 'text-warn' : 'text-muted')}>
          FPS{' '}
          <span ref={fpsRef} data-testid="fps">
            -
          </span>
          {fpsLow && <span data-testid="fps-warning"> · ต่ำกว่ารีเฟรชเรตจอ</span>}
        </div>
      </div>
    </div>
  )
}
