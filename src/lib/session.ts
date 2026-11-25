import type { DrillKind, DrillResult } from './metrics'
import { drillScores, flickBias, flickLead, measuredScore, type AimBias, type CandidateRun, type DrillScores, type Role } from './scoring'
import { defaultSens, roundSens } from './sens'
import { estimate, FINE_FACTORS, planSweep, WIDE_FACTORS, type CurvePoint, type SweepPoint } from './sweep'

/** The whole test flow as plain data (persisted to localStorage), plus pure transitions. */

export const DRILL_ORDER: DrillKind[] = ['flick', 'micro', 'tracking']

export interface Settings {
  dpi: number
  /** Sens the player uses now, if given (the centre of the first sweep). */
  userSens: number | null
  role: Role
}

export type PartialRun = Partial<CandidateRun>

/** One finished set: a sensitivity and its three drill results. */
export interface SetRecord {
  sens: number
  run: CandidateRun
}

export interface Session {
  settings: Settings
  startSens: number
  /** Target seed shared by every scored set, so all sensitivities face the same targets. */
  seed: number
  /** 'wide' first, then 'fine' around the estimate (repeated by "ทดสอบเพิ่ม"). */
  phase: 'wide' | 'fine'
  /** Sensitivities still to play in this sweep, in play order; [0] is being played. Empty = finished. */
  queue: number[]
  /** Drills finished for queue[0]. */
  current: PartialRun
  /** Warm-up drills finished (unscored); null once done or when skipped ("ทดสอบเพิ่ม"). */
  warmup: PartialRun | null
  /** Whether this run of the test includes a warm-up set (for progress). */
  hasWarmup: boolean
  sets: SetRecord[]
  /** Scored sets planned in total, for progress. */
  plannedSets: number
}

export type Step =
  | { stage: 'warmup'; drill: DrillKind; sens: number; seed: number }
  | { stage: 'set'; index: number; drill: DrillKind; sens: number; seed: number }

const WARMUP_SEED_MIX = 0x3c6ef372
const ORDER_SEED_MIX = 0x85ebca6b

export function startSensFor(settings: Settings): number {
  return settings.userSens ?? defaultSens(settings.dpi)
}

/** Full search: warm-up, a wide sweep around the user's sens (or eDPI 280), then a fine sweep. */
export function newSession(settings: Settings, seed: number): Session {
  const startSens = startSensFor(settings)
  return {
    settings,
    startSens,
    seed,
    phase: 'wide',
    queue: planSweep(startSens, WIDE_FACTORS, seed ^ ORDER_SEED_MIX),
    current: {},
    warmup: {},
    hasWarmup: true,
    sets: [],
    plannedSets: WIDE_FACTORS.length + FINE_FACTORS.length,
  }
}

/** "ทดสอบเพิ่ม": one more fine sweep around the current result, added to the same data. No warm-up. */
export function extendSession(s: Session, seed: number): Session {
  if (!isFinished(s) || s.sets.length === 0) return s
  return {
    ...s,
    phase: 'fine',
    queue: planSweep(summarizeSession(s).sens, FINE_FACTORS, seed ^ ORDER_SEED_MIX),
    current: {},
    warmup: null,
    hasWarmup: false,
    plannedSets: s.sets.length + FINE_FACTORS.length,
  }
}

const nextDrill = (run: PartialRun): DrillKind | null => DRILL_ORDER.find((k) => !run[k]) ?? null

/** What to play next; null when the search is over. */
export function currentStep(s: Session): Step | null {
  if (s.queue.length === 0) return null
  if (s.warmup) {
    const drill = nextDrill(s.warmup)
    if (drill) return { stage: 'warmup', drill, sens: s.startSens, seed: s.seed ^ WARMUP_SEED_MIX }
  }
  const drill = nextDrill(s.current)
  if (!drill) return null
  return { stage: 'set', index: s.sets.length, drill, sens: s.queue[0], seed: s.seed }
}

export const isFinished = (s: Session): boolean => s.queue.length === 0

/** Records a finished drill for the current step. Ignores a result for the wrong drill. */
export function recordDrill(s: Session, result: DrillResult): Session {
  const step = currentStep(s)
  if (!step || step.drill !== result.kind) return s
  if (step.stage === 'warmup') {
    const warmup = { ...s.warmup, [result.kind]: result }
    return { ...s, warmup: nextDrill(warmup) ? warmup : null }
  }
  const current = { ...s.current, [result.kind]: result }
  if (nextDrill(current)) return { ...s, current }

  const sets = [...s.sets, { sens: step.sens, run: current as CandidateRun }]
  const queue = s.queue.slice(1)
  const next = { ...s, sets, queue, current: {} }
  if (queue.length > 0 || s.phase !== 'wide') return next
  // Wide sweep done: zoom in on its estimate.
  return { ...next, phase: 'fine', queue: planSweep(estimateOf(next).sens, FINE_FACTORS, s.seed ^ ORDER_SEED_MIX ^ sets.length) }
}

/** Score inputs for each finished set. */
export function sweepPoints(s: Session): SweepPoint[] {
  return s.sets.map((x) => ({ sens: x.sens, score: measuredScore(drillScores(x.run), s.settings.role), flickLead: flickLead(x.run.flick) }))
}

const estimateOf = (s: Session) => estimate(sweepPoints(s))

// --- Progress / time ----------------------------------------------------------------------------

/** Rough play time per drill, seconds. The three drills of a set run back to back. */
export const DRILL_EST_S: Record<DrillKind, number> = { flick: 8, micro: 5, tracking: 6 }
/** Intro click and 3-2-1 countdown, once at the start of each set. */
export const SET_OVERHEAD_S = 5
const SET_EST_S = SET_OVERHEAD_S + DRILL_ORDER.reduce((t, k) => t + DRILL_EST_S[k], 0)

const doneDrills = (run: PartialRun | null) => (run ? DRILL_ORDER.filter((k) => run[k]).length : 0)
const remainingIn = (run: PartialRun) =>
  (doneDrills(run) === 0 ? SET_OVERHEAD_S : 0) + DRILL_ORDER.filter((k) => !run[k]).reduce((t, k) => t + DRILL_EST_S[k], 0)

export interface Progress {
  /** 1-based current set (capped at the total once done). */
  set: number
  totalSets: number
  /** Drills done / total (warm-up included), for the progress bar. */
  drillsDone: number
  drillsTotal: number
  /** Estimated seconds left. */
  remainingS: number
}

export function progress(s: Session): Progress {
  const n = DRILL_ORDER.length
  const warmupDone = s.warmup ? doneDrills(s.warmup) : s.hasWarmup ? n : 0
  const drillsTotal = (s.hasWarmup ? n : 0) + s.plannedSets * n
  const drillsDone = warmupDone + s.sets.length * n + (isFinished(s) ? 0 : doneDrills(s.current))

  let remainingS = 0
  if (!isFinished(s)) {
    if (s.warmup) remainingS += remainingIn(s.warmup)
    remainingS += remainingIn(s.current) + Math.max(0, s.plannedSets - s.sets.length - 1) * SET_EST_S
  }
  return { set: Math.min(s.sets.length + 1, s.plannedSets), totalSets: s.plannedSets, drillsDone, drillsTotal, remainingS }
}

/** Estimated length of a full session before it starts, seconds. */
export const FULL_SESSION_EST_S = SET_EST_S * (1 + WIDE_FACTORS.length + FINE_FACTORS.length)

// --- Results ------------------------------------------------------------------------------------

export interface SessionSummary {
  sens: number
  /** Near-best range from the score curve, in the 3-decimal values the user can enter. */
  range: [number, number]
  /** Smoothed score curve and the raw scored sets, for the chart. */
  curve: CurvePoint[]
  points: SweepPoint[]
  /** Where flicks neither over- nor undershoot; null when unclear. */
  balanceSens: number | null
  /** Lowest and highest sensitivity tested. */
  tested: [number, number]
  /** Mean per-drill scores over every scored set; null with no sets. */
  profile: DrillScores | null
  /**
   * How often a clear flick bias showed, also split by sets faster / slower than the result.
   * Overshooting when faster and undershooting when slower is the pattern that confirms the result.
   */
  bias: {
    runs: number
    over: number
    under: number
    overWhenFaster: number
    underWhenSlower: number
  }
}

/** @throws RangeError before any set is finished */
export function summarizeSession(s: Session): SessionSummary {
  const points = sweepPoints(s)
  const e = estimate(points)
  const sens = e.sens
  const scores = s.sets.map((x) => drillScores(x.run))
  const avg = (k: keyof DrillScores) => scores.reduce((t, x) => t + x[k], 0) / scores.length
  const biases: { sens: number; bias: AimBias }[] = s.sets.map((x) => ({ sens: x.sens, bias: flickBias(x.run.flick.summary) }))
  // Round to what the game accepts, and make sure the shown result sits inside the shown range.
  const shown = roundSens(sens)
  const range: [number, number] = [Math.min(shown, roundSens(e.range[0])), Math.max(shown, roundSens(e.range[1]))]
  return {
    sens,
    range,
    curve: e.curve,
    points,
    balanceSens: e.balanceSens,
    tested: e.tested,
    profile: scores.length ? { flick: avg('flick'), micro: avg('micro'), tracking: avg('tracking') } : null,
    bias: {
      runs: biases.length,
      over: biases.filter((b) => b.bias === 'over').length,
      under: biases.filter((b) => b.bias === 'under').length,
      overWhenFaster: biases.filter((b) => b.bias === 'over' && b.sens > sens).length,
      underWhenSlower: biases.filter((b) => b.bias === 'under' && b.sens < sens).length,
    },
  }
}
