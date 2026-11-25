import type { MutableRefObject } from 'react'
import type { LookTracker } from '../lib/look'
import { lookToDirection } from '../lib/look'
import type { LookAngles } from '../lib/sens'

export type DrillKind = 'flick' | 'micro' | 'tracking'

export interface DrillProps {
  /** Same seed gives the same targets, so sens A and B face identical drills. */
  seed: number
  tracker: MutableRefObject<LookTracker>
  /** Applies pending mouse input right now, so a click is judged on the latest aim. */
  flush: () => void
  /** The drill clock only runs while true (pointer locked, not paused). */
  active: boolean
  onShot?: (hit: boolean) => void
  /** Live state for the debug panel and automated tests. */
  debugRef?: MutableRefObject<DrillDebugState | null>
}

export interface DrillDebugState {
  kind: DrillKind
  /** Targets done (click drills) or 0 (tracking). */
  index: number
  total: number
  target: LookAngles | null
  /** Drill clock, seconds. */
  clock: number
  done: boolean
}

/** Longest frame gap the drill clock accepts, so a stall doesn't eat a whole target's time. */
export const MAX_FRAME_S = 0.1

/** World position for a look direction at a distance. */
export function positionFor(look: LookAngles, distance: number): [number, number, number] {
  const [x, y, z] = lookToDirection(look)
  return [x * distance, y * distance, z * distance]
}
