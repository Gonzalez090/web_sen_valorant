import type { ClickDrillResult, ClickSummary, TrackingResult } from './metrics'

/** Everything measured for one sensitivity: one run of each drill. */
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

/** Which one the player felt they controlled better. */
export type Preference = 'A' | 'B' | 'same'

export const MEASURED_WEIGHT = 0.6
export const FEEL_WEIGHT = 0.4

/** Final score per candidate: measured 60% + feel 40% (preferred = 1, other = 0, same = 0.5 each). */
export function totalScores(measuredA: number, measuredB: number, pref: Preference): { a: number; b: number } {
  const feelA = pref === 'A' ? 1 : pref === 'B' ? 0 : 0.5
  return {
    a: MEASURED_WEIGHT * measuredA + FEEL_WEIGHT * feelA,
    b: MEASURED_WEIGHT * measuredB + FEEL_WEIGHT * (1 - feelA),
  }
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

/** Totals closer than this are "close": the over/undershoot signal decides, else it's a tie. */
export const CLOSE_MARGIN = 0.05

export interface CandidateInput {
  sens: number
  run: CandidateRun
}

export interface Judgement {
  winner: 'A' | 'B' | 'tie'
  /** How it was decided. */
  by: 'score' | 'bias' | 'tie'
  scores: { a: DrillScores; b: DrillScores }
  measured: { a: number; b: number }
  total: { a: number; b: number }
  bias: { a: AimBias; b: AimBias }
}

/**
 * Compares A and B. A clear total-score lead wins. When the totals are close, a clear overshoot on
 * the higher sens (too fast) or undershoot on the lower sens (too slow) picks the other one; if
 * neither shows, or both do (conflicting), it's a tie.
 */
export function judge(a: CandidateInput, b: CandidateInput, pref: Preference, role: Role): Judgement {
  const scores = { a: drillScores(a.run), b: drillScores(b.run) }
  const measured = { a: measuredScore(scores.a, role), b: measuredScore(scores.b, role) }
  const total = totalScores(measured.a, measured.b, pref)
  const bias = { a: flickBias(a.run.flick.summary), b: flickBias(b.run.flick.summary) }
  const base = { scores, measured, total, bias }

  const diff = total.a - total.b
  if (Math.abs(diff) >= CLOSE_MARGIN) return { ...base, winner: diff > 0 ? 'A' : 'B', by: 'score' }
  if (a.sens === b.sens) return { ...base, winner: 'tie', by: 'tie' }

  const [hi, lo] = a.sens > b.sens ? (['A', 'B'] as const) : (['B', 'A'] as const)
  const biasOf = (x: 'A' | 'B') => (x === 'A' ? bias.a : bias.b)
  const hiTooFast = biasOf(hi) === 'over'
  const loTooSlow = biasOf(lo) === 'under'
  if (hiTooFast && !loTooSlow) return { ...base, winner: lo, by: 'bias' }
  if (loTooSlow && !hiTooFast) return { ...base, winner: hi, by: 'bias' }
  return { ...base, winner: 'tie', by: 'tie' }
}
