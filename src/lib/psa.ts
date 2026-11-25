import { mulberry32 } from './rng'

/**
 * PSA (progressive sensitivity adjustment): each round compares base × (1 − k) with base × (1 + k),
 * the winner becomes the new base, and k halves. A final validation round compares base with a
 * neighbour validationStep away and moves there only if the neighbour wins.
 */
export interface PsaConfig {
  startK: number
  /** Narrowing rounds before the validation round. */
  narrowRounds: number
  validationStep: number
}

/** Full search: k = 0.5 → 0.016 over 6 rounds, then validation (7 rounds). */
export const FULL_PSA: PsaConfig = { startK: 0.5, narrowRounds: 6, validationStep: 0.05 }
/** "ทดสอบละเอียดต่อ": starts from the last result with k = 0.1. */
export const FINE_PSA: PsaConfig = { startK: 0.1, narrowRounds: 3, validationStep: 0.05 }

export type Side = 'low' | 'high' | 'base'

export interface Candidate {
  sens: number
  side: Side
}

export interface RoundPlan {
  /** 0-based round index. */
  index: number
  kind: 'narrow' | 'validation'
  base: number
  /** Multiplier used for this round (validationStep for validation). */
  k: number
  /** Target seed shared by both candidates. */
  seed: number
  /** Play order: [0] is shown as "A", [1] as "B". */
  candidates: [Candidate, Candidate]
}

export interface PsaState {
  config: PsaConfig
  base: number
  k: number
  /** Rounds completed. */
  round: number
}

export type Winner = 'A' | 'B' | 'tie'

export const totalRounds = (c: PsaConfig): number => c.narrowRounds + 1

/** @throws RangeError if startSens is not a positive finite number */
export function initPsa(startSens: number, config: PsaConfig = FULL_PSA): PsaState {
  if (!(Number.isFinite(startSens) && startSens > 0)) throw new RangeError(`startSens must be positive, got ${startSens}`)
  return { config, base: startSens, k: config.startK, round: 0 }
}

export const isDone = (s: PsaState): boolean => s.round >= totalRounds(s.config)

/**
 * Plans the next round. The A/B order is shuffled from the seed (so it's reproducible).
 * validationSide picks which neighbour the validation round tests; ignored for narrowing rounds.
 * @throws Error if the search is already done
 */
export function planRound(s: PsaState, seed: number, validationSide: 'low' | 'high'): RoundPlan {
  if (isDone(s)) throw new Error('PSA is already done')
  const validation = s.round >= s.config.narrowRounds
  let pair: [Candidate, Candidate]
  let k: number
  if (validation) {
    k = s.config.validationStep
    const f = validationSide === 'low' ? 1 - k : 1 + k
    pair = [
      { sens: s.base, side: 'base' },
      { sens: s.base * f, side: validationSide },
    ]
  } else {
    k = s.k
    pair = [
      { sens: s.base * (1 - k), side: 'low' },
      { sens: s.base * (1 + k), side: 'high' },
    ]
  }
  if (mulberry32(seed)() < 0.5) pair.reverse()
  return { index: s.round, kind: validation ? 'validation' : 'narrow', base: s.base, k, seed, candidates: pair }
}

/** The base after a round: the winner's sens, or the old base on a tie. */
export function nextBase(plan: RoundPlan, winner: Winner): number {
  if (winner === 'tie') return plan.base
  return plan.candidates[winner === 'A' ? 0 : 1].sens
}

/**
 * Applies a round's outcome: new base, k halves (narrowing rounds only), round count + 1.
 * @throws Error if the plan isn't for the state's current round
 */
export function applyRound(s: PsaState, plan: RoundPlan, winner: Winner): PsaState {
  if (plan.index !== s.round) throw new Error(`plan is for round ${plan.index}, state is at ${s.round}`)
  return {
    ...s,
    base: nextBase(plan, winner),
    k: plan.kind === 'narrow' ? s.k * 0.5 : s.k,
    round: s.round + 1,
  }
}

/** Overshoot-minus-undershoot lead beyond which validation tests the neighbour the bias points to. */
export const VALIDATION_BIAS_LEAD = 0.1

/**
 * Which neighbour the validation round should test.
 * - biasLead: mean (overshootRate − undershootRate) of recent flick runs; overshooting → try lower.
 * - lastMove: sign of the most recent base change; with no clear bias, keep going that way.
 * - Otherwise decided by the seed.
 */
export function validationSide(biasLead: number | null, lastMove: number, seed: number): 'low' | 'high' {
  if (biasLead !== null && biasLead > VALIDATION_BIAS_LEAD) return 'low'
  if (biasLead !== null && biasLead < -VALIDATION_BIAS_LEAD) return 'high'
  if (lastMove > 0) return 'high'
  if (lastMove < 0) return 'low'
  return mulberry32(seed ^ 0x9e3779b9)() < 0.5 ? 'low' : 'high'
}
