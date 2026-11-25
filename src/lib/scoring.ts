import type { ClickDrillResult, ClickSummary, TrackingResult } from './metrics'

/** Everything measured for one sensitivity: one run of each drill (one set). */
export interface CandidateRun {
  flick: ClickDrillResult
  micro: ClickDrillResult
  tracking: TrackingResult
}

export type Role = 'duelist' | 'other'

/** Per-drill scores, each 0–1 (higher is better). */
export interface DrillScores {
  flick: number
  micro: number
  tracking: number
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** 1 at `best` or better, 0 at `worst` or worse, linear between. */
function scale(x: number, best: number, worst: number): number {
  return clamp01((worst - x) / (worst - best))
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Flick reference ranges: hit time and first-movement error relative to the flick distance. */
export const FLICK_TIME_MS = { best: 400, worst: 1600 }
export const FLICK_REL_ERROR = { best: 0, worst: 0.3 }
/** Micro reference ranges. */
export const MICRO_TIME_MS = { best: 250, worst: 1200 }
export const MICRO_CORRECTIONS = { best: 0, worst: 4 }
/** Tracking: mean distance from the body centre, degrees. */
export const TRACKING_ERROR_DEG = { best: 0, worst: 6 }

/** Mean |first-movement error| / distance over attempted flicks; null if none were attempted. */
export function flickRelativeError(r: ClickDrillResult): number | null {
  return mean(
    r.trials.flatMap((t) =>
      t.attempted && t.primaryErrorDeg !== null && t.distanceDeg > 0 ? [Math.abs(t.primaryErrorDeg) / t.distanceDeg] : [],
    ),
  )
}

/**
 * Mean signed first-movement error / distance over attempted flicks (+ overshoot, − undershoot);
 * null if none were attempted. Its trend across sensitivities shows where flicks balance out.
 */
export function flickLead(r: ClickDrillResult): number | null {
  return mean(
    r.trials.flatMap((t) => (t.attempted && t.primaryErrorDeg !== null && t.distanceDeg > 0 ? [t.primaryErrorDeg / t.distanceDeg] : [])),
  )
}

/** Hits 50%, speed 30%, first-movement precision 20%. */
export function flickScore(r: ClickDrillResult): number {
  const s = r.summary
  const speed = s.meanTimeMs === null ? 0 : scale(s.meanTimeMs, FLICK_TIME_MS.best, FLICK_TIME_MS.worst)
  const rel = flickRelativeError(r)
  const precision = rel === null ? 0 : scale(rel, FLICK_REL_ERROR.best, FLICK_REL_ERROR.worst)
  return 0.5 * s.hitRate + 0.3 * speed + 0.2 * precision
}

/** Hits 50%, speed 30%, steadiness (few corrections) 20%. */
export function microScore(r: ClickDrillResult): number {
  const s = r.summary
  const speed = s.meanTimeMs === null ? 0 : scale(s.meanTimeMs, MICRO_TIME_MS.best, MICRO_TIME_MS.worst)
  const steady = scale(s.meanCorrections, MICRO_CORRECTIONS.best, MICRO_CORRECTIONS.worst)
  return 0.5 * s.hitRate + 0.3 * speed + 0.2 * steady
}

/** Time on target 70%, mean distance from the body 30%. */
export function trackingScore(r: TrackingResult): number {
  const s = r.summary
  return 0.7 * clamp01(s.onTargetRatio) + 0.3 * scale(s.meanErrorDeg, TRACKING_ERROR_DEG.best, TRACKING_ERROR_DEG.worst)
}

export function drillScores(run: CandidateRun): DrillScores {
  return { flick: flickScore(run.flick), micro: microScore(run.micro), tracking: trackingScore(run.tracking) }
}

export const DRILL_WEIGHTS: Record<Role, DrillScores> = {
  other: { flick: 0.4, micro: 0.25, tracking: 0.35 },
  // Duelists take more opening duels, so flicks count for more.
  duelist: { flick: 0.5, micro: 0.2, tracking: 0.3 },
}

/** Weighted measured score, 0–1. */
export function measuredScore(scores: DrillScores, role: Role): number {
  const w = DRILL_WEIGHTS[role]
  return w.flick * scores.flick + w.micro * scores.micro + w.tracking * scores.tracking
}

export type AimBias = 'over' | 'under' | 'none'

/** Need at least this many attempted flicks before calling a bias. */
export const BIAS_MIN_TRIALS = 4
/** A bias is "clear" when it shows on this share of flicks… */
export const BIAS_MIN_RATE = 0.35
/** …and beats the opposite tendency by this much. */
export const BIAS_MIN_LEAD = 0.2

/** Consistent overshoot means the sens is likely too high; consistent undershoot, too low. */
export function flickBias(s: ClickSummary): AimBias {
  if (s.trials - s.noAttempt < BIAS_MIN_TRIALS) return 'none'
  if (s.overshootRate >= BIAS_MIN_RATE && s.overshootRate - s.undershootRate >= BIAS_MIN_LEAD) return 'over'
  if (s.undershootRate >= BIAS_MIN_RATE && s.undershootRate - s.overshootRate >= BIAS_MIN_LEAD) return 'under'
  return 'none'
}
