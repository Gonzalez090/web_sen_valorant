import type { CSSProperties } from 'react'

interface CrosshairProps {
  color?: string
  /** Line length in px. */
  length?: number
  /** Gap from centre to each line in px. */
  gap?: number
  thickness?: number
  dot?: boolean
}

/** Centre-screen crosshair: four lines plus an optional dot, with a thin dark outline. */
export function Crosshair({ color = '#3DDC97', length = 6, gap = 4, thickness = 2, dot = true }: CrosshairProps) {
  const outline = '0 0 0 1px rgba(0,0,0,0.6)'
  const line = (style: CSSProperties) => (
    <div style={{ position: 'absolute', background: color, boxShadow: outline, ...style }} />
  )
  const half = thickness / 2

  return (
    <div
      aria-hidden
      data-testid="crosshair"
      style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none' }}
    >
      {line({ left: -half, top: -(gap + length), width: thickness, height: length })}
      {line({ left: -half, top: gap, width: thickness, height: length })}
      {line({ top: -half, left: -(gap + length), width: length, height: thickness })}
      {line({ top: -half, left: gap, width: length, height: thickness })}
      {dot && line({ left: -half, top: -half, width: thickness, height: thickness })}
    </div>
  )
}
