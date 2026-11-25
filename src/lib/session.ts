import type { DrillKind, DrillResult } from './metrics'
import { applyRound, FINE_PSA, FULL_PSA, initPsa, isDone, planRound, totalRounds, validationSide, type PsaState, type RoundPlan } from './psa'
import { drillScores, flickBias, judge, type AimBias, type CandidateRun, type DrillScores, type Judgement, type Preference, type Role } from './scoring'
import { defaultSens } from './sens'

/** The whole test flow as plain data (persisted to localStorage), plus pure transitions. */

export const DRILL_ORDER: DrillKind[] = ['flick', 'micro', 'tracking']

export interface Settings {
  dpi: number
  /** Sens the player uses now, if given (the starting point). */
  userSens: number | null
  role: Role
}

export type PartialRun = Partial<CandidateRun>

export interface RoundRecord {
  plan: RoundPlan
  runs: [CandidateRun, CandidateRun]
  preference: Preference
  judgement: Judgement
  baseAfter: number
}

export interface Session {
  settings: Settings
  mode: 'full' | 'fine'
  startSens: number
  psa: PsaState
  /** Current round; null once the search is done. */
  plan: RoundPlan | null
  /** Drills finished in the current round, per candidate in play order. */
  runs: [PartialRun, PartialRun]
  /** Warm-up drills finished (unscored); null when there's no warm-up (fine mode) or it's done. */
  warmup: PartialRun | null
  history: RoundRecord[]
}

export type Step =
  | { stage: 'warmup'; drill: DrillKind; sens: number; seed: number }
  | { stage: 'round'; candidate: 0 | 1; drill: DrillKind; sens: number; seed: number }

const WARMUP_SEED_MIX = 0x3c6ef372

export function startSensFor(settings: Settings): number {
  return settings.userSens ?? defaultSens(settings.dpi)
}

/** Full search from the user's sens (or eDPI 280), with a warm-up first. */
export function newSession(settings: Settings, seed: number): Session {
  const startSens = startSensFor(settings)
  const psa = initPsa(startSens, FULL_PSA)
  return { settings, mode: 'full', startSens, psa, plan: planRound(psa, seed, 'high'), runs: [{}, {}], warmup: {}, history: [] }
}

/** "ทดสอบละเอียดต่อ": k = 0.1 from a previous result, no warm-up. */
export function fineSession(settings: Settings, fromSens: number, seed: number): Session {
  const psa = initPsa(fromSens, FINE_PSA)
  return { settings, mode: 'fine', startSens: fromSens, psa, plan: planRound(psa, seed, 'high'), runs: [{}, {}], warmup: null, history: [] }
}

const nextDrill = (run: PartialRun): DrillKind | null => DRILL_ORDER.find((k) => !run[k]) ?? null

/** What to play next; null when both candidates are done (time to choose) or the search is over. */
export function currentStep(s: Session): Step | null {
  if (!s.plan) return null
  if (s.warmup) {
    const drill = nextDrill(s.warmup)
    if (drill) return { stage: 'warmup', drill, sens: s.startSens, seed: s.plan.seed ^ WARMUP_SEED_MIX }
  }
  for (const c of [0, 1] as const) {
    const drill = nextDrill(s.runs[c])
    if (drill) return { stage: 'round', candidate: c, drill, sens: s.plan.candidates[c].sens, seed: s.plan.seed }
  }
  return null
}

export const awaitingChoice = (s: Session): boolean => s.plan !== null && currentStep(s) === null
export const isFinished = (s: Session): boolean => s.plan === null

/** Records a finished drill for the current step. Ignores a result for the wrong drill. */
export function recordDrill(s: Session, result: DrillResult): Session {
  const step = currentStep(s)
  if (!step || step.drill !== result.kind) return s
  if (step.stage === 'warmup') {
    const warmup = { ...s.warmup, [result.kind]: result }
    return { ...s, warmup: nextDrill(warmup) ? warmup : null }
  }
  const runs: [PartialRun, PartialRun] = [s.runs[0], s.runs[1]]
  runs[step.candidate] = { ...runs[step.candidate], [result.kind]: result }
  return { ...s, runs }
}

/** Mean overshoot-minus-undershoot of the flick runs in the latest round; null with no history. */
function recentBiasLead(history: RoundRecord[]): number | null {
  const last = history[history.length - 1]
  if (!last) return null
  const leads = last.runs.map((r) => r.flick.summary.overshootRate - r.flick.summary.undershootRate)
  return leads.reduce((a, b) => a + b, 0) / leads.length
}

/** Sign of the most recent base change that wasn't a tie. */
function lastMove(history: RoundRecord[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const d = history[i].baseAfter - history[i].plan.base
    if (d !== 0) return Math.sign(d)
  }
  return 0
}

/**
 * Applies the player's A/B answer: judges the round, moves the base, and plans the next round
 * (or finishes). Does nothing unless both candidates are complete.
 */
export function choose(s: Session, pref: Preference, nextSeed: number): Session {
  if (!awaitingChoice(s) || !s.plan) return s
  const [a, b] = s.runs as [CandidateRun, CandidateRun]
  const plan = s.plan
  const judgement = judge({ sens: plan.candidates[0].sens, run: a }, { sens: plan.candidates[1].sens, run: b }, pref, s.settings.role)
  const psa = applyRound(s.psa, plan, judgement.winner)
  const history = [...s.history, { plan, runs: [a, b] as [CandidateRun, CandidateRun], preference: pref, judgement, baseAfter: psa.base }]
  const next = isDone(psa) ? null : planRound(psa, nextSeed, validationSide(recentBiasLead(history), lastMove(history), nextSeed))
  return { ...s, psa, plan: next, runs: [{}, {}], history }
}

// --- Progress / time ----------------------------------------------------------------------------

/** Rough wall time per drill including the intro and countdown, seconds. */
export const DRILL_EST_S: Record<DrillKind, number> = { flick: 25, micro: 20, tracking: 27 }
export const CHOICE_EST_S = 10
const SET_EST_S = DRILL_ORDER.reduce((t, k) => t + DRILL_EST_S[k], 0)

const doneDrills = (run: PartialRun | null) => (run ? DRILL_ORDER.filter((k) => run[k]).length : 0)
const remainingIn = (run: PartialRun) => DRILL_ORDER.filter((k) => !run[k]).reduce((t, k) => t + DRILL_EST_S[k], 0)

export interface Progress {
  /** 1-based current round (capped at the total once done). */
  round: number
  totalRounds: number
  /** Drills done / total (warm-up included), for the progress bar. */
  drillsDone: number
  drillsTotal: number
  /** Estimated seconds left. */
  remainingS: number
}

export function progress(s: Session): Progress {
  const rounds = totalRounds(s.psa.config)
  const hasWarmup = s.mode === 'full'
  const perRound = 2 * DRILL_ORDER.length
  const drillsTotal = (hasWarmup ? DRILL_ORDER.length : 0) + rounds * perRound
  const warmupDone = hasWarmup ? (s.warmup ? doneDrills(s.warmup) : DRILL_ORDER.length) : 0
  const roundDone = s.plan ? doneDrills(s.runs[0]) + doneDrills(s.runs[1]) : 0
  const drillsDone = warmupDone + s.history.length * perRound + roundDone

  let remainingS = 0
  if (s.warmup) remainingS += remainingIn(s.warmup)
  if (s.plan) {
    remainingS += remainingIn(s.runs[0]) + remainingIn(s.runs[1]) + CHOICE_EST_S
    remainingS += (rounds - s.history.length - 1) * (2 * SET_EST_S + CHOICE_EST_S)
  }
  return { round: Math.min(s.history.length + 1, rounds), totalRounds: rounds, drillsDone, drillsTotal, remainingS }
}

/** Estimated length of a full session before it starts, seconds. */
export const FULL_SESSION_EST_S = SET_EST_S + totalRounds(FULL_PSA) * (2 * SET_EST_S + CHOICE_EST_S)

// --- Results ------------------------------------------------------------------------------------

/** Suggested manual-tweak range around the result. */
export const RANGE_PCT = 0.03

export interface SessionSummary {
  sens: number
  range: [number, number]
  /** Mean per-drill scores over every scored run; null with no rounds. */
  profile: DrillScores | null
  /**
   * How often a clear flick bias showed, also split by runs faster / slower than the result.
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

export function summarizeSession(s: Session): SessionSummary {
  const sens = s.psa.base
  const runs = s.history.flatMap((r) => r.runs.map((run, i) => ({ sens: r.plan.candidates[i].sens, run })))
  const scores = runs.map((r) => drillScores(r.run))
  const avg = (k: keyof DrillScores) => scores.reduce((t, x) => t + x[k], 0) / scores.length
  const biases: { sens: number; bias: AimBias }[] = runs.map((r) => ({ sens: r.sens, bias: flickBias(r.run.flick.summary) }))
  return {
    sens,
    range: [sens * (1 - RANGE_PCT), sens * (1 + RANGE_PCT)],
    profile: scores.length ? { flick: avg('flick'), micro: avg('micro'), tracking: avg('tracking') } : null,
    bias: {
      runs: runs.length,
      over: biases.filter((b) => b.bias === 'over').length,
      under: biases.filter((b) => b.bias === 'under').length,
      overWhenFaster: biases.filter((b) => b.bias === 'over' && b.sens > sens).length,
      underWhenSlower: biases.filter((b) => b.bias === 'under' && b.sens < sens).length,
    },
  }
}
