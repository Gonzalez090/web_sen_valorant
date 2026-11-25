import type { RefObject } from 'react'
import { C, FONT } from '../ui/styles'

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

/** Thin, translucent edge HUD; nothing near the crosshair. */
export function Hud({ label, rounds, drillText, progress, fpsRef, fpsLow }: HudProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>
      <div
        data-testid="hud-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)' }}
      >
        <div style={{ height: '100%', width: `${progress * 100}%`, background: C.accent, opacity: 0.8 }} />
      </div>

      <div style={{ position: 'absolute', top: 14, left: 16, color: 'rgba(245,247,250,0.75)', fontSize: 13 }}>
        <div data-testid="hud-label">{label}</div>
        {rounds && (
          <div data-testid="hud-stepper" aria-label={`รอบ ${Math.min(rounds.done + 1, rounds.total)} จาก ${rounds.total}`} style={{ marginTop: 6, display: 'flex', gap: 4 }}>
            {Array.from({ length: rounds.total }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: i < rounds.done ? C.accent : i === rounds.done ? C.text : 'rgba(255,255,255,0.18)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', top: 14, right: 16, textAlign: 'right', fontSize: 13, color: 'rgba(245,247,250,0.75)' }}>
        {drillText && <div data-testid="hud-drill">{drillText}</div>}
        <div style={{ marginTop: 4, fontSize: 11, color: fpsLow ? C.amber : C.muted, opacity: 0.8 }}>
          FPS <span ref={fpsRef} data-testid="fps">-</span>
          {fpsLow && <span data-testid="fps-warning"> · ต่ำกว่ารีเฟรชเรตจอ</span>}
        </div>
      </div>
    </div>
  )
}
