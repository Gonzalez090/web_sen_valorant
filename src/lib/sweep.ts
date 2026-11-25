import { mulberry32 } from './rng'

/**
 * Sensitivity sweep: play a spread of sensitivities (order shuffled, values hidden), score each,
 * fit a smooth performance curve over them and take its peak. A second, finer sweep around that
 * peak sharpens the estimate, and every extra sweep adds to the same data.
 *
 * Sensitivities are compared on a log scale: going from 0.2 to 0.4 is as big a change in feel as
 * going from 0.4 to 0.8.
 */

/** Wide sweep: 7 sensitivities from ×0.5 to ×2 of the start, each ×1.26 (2^⅓) apart. */
export const WIDE_FACTORS = Array.from({ length: 7 }, (_, i) => 2 ** ((i - 3) / 3))
/** Fine sweep: 5 sensitivities from ×0.87 to ×1.15 of the current estimate, each ×1.07 (2^0.1) apart. */
export const FINE_FACTORS = Array.from({ length: 5 }, (_, i) => 2 ** ((i - 2) / 10))

/** Gaussian smoothing width in ln(sens): ≈ ±16% around each point carries most of the weight. */
export const BANDWIDTH = 0.15
/** The suggested range is where the smoothed score stays within this share of the peak. */
export const NEAR_BEST = 0.97
/** Weight of the flick over/undershoot balance point in the final estimate. */
export const BIAS_WEIGHT = 0.3
/** Need this many scored sets with flick data before trusting the balance point. */
export const BIAS_MIN_POINTS = 4

/** One scored set. */
export interface SweepPoint {
  sens: number
  /** Weighted measured score, 0–1. */
  score: number
  /** Mean signed flick first-movement error ÷ distance (+ overshoot, − undershoot); null if no flick was attempted. */
  flickLead: number | null
}

export interface CurvePoint {
  sens: number
  score: number
}

export interface Estimate {
  /** Recommended sensitivity. */
  sens: number
  /** Where the smoothed score is within NEAR_BEST of its peak (always contains `sens`). */
  range: [number, number]
  /** Peak of the smoothed score curve. */
  peakSens: number
  peakScore: number
  /** Where flicks neither overshoot nor undershoot on average; null when the data doesn't show one. */
  balanceSens: number | null
  /** Smoothed score over the tested span, for the chart. */
  curve: CurvePoint[]
  /** Lowest and highest sensitivity tested. */
  tested: [number, number]
}

/** Seeded Fisher–Yates shuffle (returns a new array). */
export function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Sensitivities for one sweep around `center`, in a seeded random play order. */
export function planSweep(center: number, factors: readonly number[], seed: number): number[] {
  return shuffled(
    factors.map((f) => center * f),
    seed,
  )
}

/** Gaussian kernel-weighted mean score at ln-sensitivity x. */
function smoothAt(points: readonly SweepPoint[], x: number): number {
  let wSum = 0
  let sum = 0
  for (const p of points) {
    const d = (Math.log(p.sens) - x) / BANDWIDTH
    const w = Math.exp(-0.5 * d * d)
    wSum += w
    sum += w * p.score
  }
  return wSum > 0 ? sum / wSum : 0
}

/** Smoothed score curve sampled evenly (in ln sens) across the tested span. */
export function smoothCurve(points: readonly SweepPoint[], samples = 121): CurvePoint[] {
  if (points.length === 0) return []
  const xs = points.map((p) => Math.log(p.sens))
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  if (hi - lo < 1e-9) return [{ sens: Math.exp(lo), score: smoothAt(points, lo) }]
  return Array.from({ length: samples }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (samples - 1)
    return { sens: Math.exp(x), score: smoothAt(points, x) }
  })
}

/**
 * Least-squares line of flickLead against ln(sens). Higher sens should overshoot more, so with a
 * rising line its zero crossing is the balance point. Null if there's too little data, the line
 * doesn't rise, or the crossing falls outside the tested span.
 */
export function balancePoint(points: readonly SweepPoint[]): number | null {
  const pts = points.filter((p): p is SweepPoint & { flickLead: number } => p.flickLead !== null)
  if (pts.length < BIAS_MIN_POINTS) return null
  const xs = pts.map((p) => Math.log(p.sens))
  const ys = pts.map((p) => p.flickLead)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i] - mx) ** 2
    sxy += (xs[i] - mx) * (ys[i] - my)
  }
  if (sxx < 1e-12) return null
  const slope = sxy / sxx
  if (slope <= 0) return null
  const x0 = mx - my / slope
  if (x0 < Math.min(...xs) || x0 > Math.max(...xs)) return null
  return Math.exp(x0)
}

/**
 * Recommended sensitivity from all scored sets: the peak of the smoothed score curve, pulled
 * BIAS_WEIGHT of the way (in log terms) toward the flick balance point when there is one, and
 * kept inside the near-best range.
 * @throws RangeError with no points
 */
export function estimate(points: readonly SweepPoint[]): Estimate {
  if (points.length === 0) throw new RangeError('estimate needs at least one point')
  const curve = smoothCurve(points)
  let peak = 0
  for (let i = 1; i < curve.length; i++) if (curve[i].score > curve[peak].score) peak = i
  const peakScore = curve[peak].score

  const cutoff = NEAR_BEST * peakScore
  let lo = peak
  let hi = peak
  while (lo > 0 && curve[lo - 1].score >= cutoff) lo--
  while (hi < curve.length - 1 && curve[hi + 1].score >= cutoff) hi++
  const range: [number, number] = [curve[lo].sens, curve[hi].sens]

  const balanceSens = balancePoint(points)
  const peakSens = curve[peak].sens
  let sens = peakSens
  if (balanceSens !== null) sens = Math.exp((1 - BIAS_WEIGHT) * Math.log(peakSens) + BIAS_WEIGHT * Math.log(balanceSens))
  sens = Math.min(range[1], Math.max(range[0], sens))

  const tested: [number, number] = [Math.min(...points.map((p) => p.sens)), Math.max(...points.map((p) => p.sens))]
  return { sens, range, peakSens, peakScore, balanceSens, curve, tested }
}
