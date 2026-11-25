import type { CSSProperties } from 'react'

/** Design tokens from CLAUDE.md. Plain inline styles for now; step 5 moves to Tailwind + shadcn/ui. */
export const C = {
  bg: '#0B0D10',
  bg2: '#12151A',
  card: '#171A21',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  accent: '#FF4655',
  mint: '#3DDC97',
  amber: '#FFB547',
  text: '#F5F7FA',
  muted: '#8A93A3',
}

export const FONT = "Inter, 'IBM Plex Sans Thai', 'Noto Sans Thai', system-ui, sans-serif"

export const page: CSSProperties = {
  minHeight: '100vh',
  boxSizing: 'border-box',
  padding: '48px 16px',
  background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bg2} 100%)`,
  color: C.text,
  fontFamily: FONT,
}

export const card: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: 24,
  boxSizing: 'border-box',
}

export const primaryButton: CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 10,
  border: 0,
  background: C.accent,
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FONT,
}

export const secondaryButton: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: `1px solid ${C.borderStrong}`,
  background: 'transparent',
  color: C.text,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: FONT,
}

export const overlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(11,13,16,0.55)',
  backdropFilter: 'blur(8px)',
  fontFamily: FONT,
}

export const muted: CSSProperties = { color: C.muted, fontSize: 13, lineHeight: 1.6 }
export const warn: CSSProperties = { color: C.amber, fontSize: 13, lineHeight: 1.6 }

export function chip(selected: boolean): CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${selected ? C.accent : C.borderStrong}`,
    background: selected ? 'rgba(255,70,85,0.12)' : 'transparent',
    color: C.text,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

/** "ประมาณ 3 นาที" from seconds (at least 1 minute). */
export function minutesText(s: number): string {
  return `ประมาณ ${Math.max(1, Math.round(s / 60))} นาที`
}
