import { clsx, type ClassValue } from 'clsx'
import type { KeyboardEvent } from 'react'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Arrow-key handling for a role="radiogroup" of buttons (WAI-ARIA radio pattern): arrows move and
 * select, and only the selected radio is in the Tab order (give it tabIndex 0, the rest -1).
 */
export function radioKeyDown<T>(e: KeyboardEvent<HTMLElement>, values: readonly T[], current: T, select: (v: T) => void) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  e.preventDefault()
  const i = (values.indexOf(current) + step + values.length) % values.length
  select(values[i])
  const radios = e.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]')
  radios?.[i]?.focus()
}

/** "ประมาณ 3 นาที" from seconds (at least 1 minute). */
export function minutesText(s: number): string {
  return `ประมาณ ${Math.max(1, Math.round(s / 60))} นาที`
}
