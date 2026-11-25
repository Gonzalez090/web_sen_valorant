import { summarizeClickTrials, type ClickDrillResult, type ClickTrialResult, type TrackingResult } from './metrics'
import type { CandidateRun } from './scoring'
import { FLICK, MICRO, TRACKING } from './targets'

/**
 * Synthetic drill results for unit tests and the dev-only "finish drill" hook. Not used by the
 * real flow.
 */
export interface FakeClickOptions {
  hitRate?: number
  timeMs?: number
  /** Signed first-movement error per trial (+ over, − under), degrees. */
  primaryErrorDeg?: number
  corrections?: number
  distanceDeg?: number
}

export function fakeClick(kind: 'flick' | 'micro', o: FakeClickOptions = {}): ClickDrillResult {
  const cfg = kind === 'flick' ? FLICK : MICRO
  const { hitRate = 0.8, timeMs = 700, primaryErrorDeg = 0, corrections = 1, distanceDeg = kind === 'flick' ? 50 : 5 } = o
  const hits = Math.round(hitRate * cfg.count)
  const trials: ClickTrialResult[] = Array.from({ length: cfg.count }, (_, i) => {
    const hit = i < hits
    return {
      hit,
      timeMs: hit ? timeMs : null,
      clickErrorDeg: hit ? cfg.radiusDeg / 2 : cfg.radiusDeg * 2,
      distanceDeg,
      attempted: true,
      primaryErrorDeg,
      overshootDeg: Math.max(0, primaryErrorDeg),
      corrections,
    }
  })
  return { kind, summary: summarizeClickTrials(trials, cfg.radiusDeg), trials }
}

export function fakeTracking(onTargetRatio = 0.5, meanErrorDeg = 2): TrackingResult {
  return { kind: 'tracking', summary: { durationS: TRACKING.durationS, onTargetRatio, meanErrorDeg } }
}

/** A whole candidate run at one quality level (0–1), optionally with a flick bias. */
export function fakeRun(quality = 0.6, flickPrimaryErrorDeg = 0): CandidateRun {
  const q = Math.max(0, Math.min(1, quality))
  return {
    flick: fakeClick('flick', { hitRate: q, timeMs: 1600 - q * 1000, primaryErrorDeg: flickPrimaryErrorDeg }),
    micro: fakeClick('micro', { hitRate: q, timeMs: 1200 - q * 800, corrections: 4 - 3 * q }),
    tracking: fakeTracking(q, 6 - 5 * q),
  }
}
