import { angularDistance, offsetBetween } from './look'
import type { LookAngles } from './sens'

export interface Sample {
  /** Drill clock, seconds. */
  t: number
  look: LookAngles
}

export interface ClickTrial {
  /** Look when the target appeared. */
  start: LookAngles
  target: LookAngles
  radiusDeg: number
  spawnT: number
  /** View samples from spawn to click/timeout (one per frame, plus one at the click). */
  samples: Sample[]
  /** null if the target timed out. */
  click: Sample | null
}

export interface ClickTrialResult {
  hit: boolean
  /** Spawn → hitting click, ms. null for misses. */
  timeMs: number | null
  /** Angle between crosshair and target at the click. null on timeout. */
  clickErrorDeg: number | null
  /** Planar distance from start to target. */
  distanceDeg: number
  /**
   * Whether the player made a real attempt (got at least MIN_ATTEMPT_PROGRESS of the way). Trials
   * without one (e.g. didn't notice the target before timeout) say nothing about sensitivity.
   */
  attempted: boolean
  /**
   * Where the first (ballistic) movement stopped, along the start→target line, relative to the target.
   * Positive = overshoot (went past), negative = undershoot (stopped short). null if not attempted.
   */
  primaryErrorDeg: number | null
  /** Furthest the aim went past the target along that line (0 if never). */
  overshootDeg: number
  /** Direction reversals (yaw/pitch reversals within REVERSAL_MERGE_S count once); fewer = steadier. */
  corrections: number
}

/** Fraction of peak speed below which the first movement counts as finished. */
const PRIMARY_END_SPEED = 0.1
/** A trial counts as attempted once the aim covered this share of the distance toward the target. */
export const MIN_ATTEMPT_PROGRESS = 0.2
/** Reversals on yaw and pitch this close in time are one diagonal correction. */
export const REVERSAL_MERGE_S = 0.05

/** Progress of each sample along the start→target line, in degrees. */
function progressAlong(samples: Sample[], start: LookAngles, target: LookAngles): { p: number[]; dist: number } {
  const o = offsetBetween(start, target)
  const dist = Math.hypot(o.dYaw, o.dPitch)
  if (dist === 0) return { p: samples.map(() => 0), dist }
  const ux = o.dYaw / dist
  const uy = o.dPitch / dist
  const p = samples.map((s) => {
    const d = offsetBetween(start, s.look)
    return d.dYaw * ux + d.dPitch * uy
  })
  return { p, dist }
}

/**
 * Signed error at the end of the first movement. It ends at the first sample after peak speed where
 * progress speed drops below 10% of the peak (including going backwards).
 */
export function primaryError(samples: Sample[], start: LookAngles, target: LookAngles): number {
  const { p, dist } = progressAlong(samples, start, target)
  if (p.length === 0) return -dist
  if (p.length < 2) return p[0] - dist

  const v: number[] = [0]
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t
    v.push(dt > 0 ? (p[i] - p[i - 1]) / dt : 0)
  }
  let peak = 0
  let peakIdx = -1
  for (let i = 1; i < v.length; i++) {
    if (v[i] > peak) {
      peak = v[i]
      peakIdx = i
    }
  }
  if (peakIdx < 0) return p[p.length - 1] - dist

  let end = p.length - 1
  for (let i = peakIdx + 1; i < v.length; i++) {
    if (v[i] < PRIMARY_END_SPEED * peak) {
      end = i - 1
      break
    }
  }
  return p[end] - dist
}

/**
 * Counts direction reversals. On each axis a reversal registers once movement in the new direction
 * exceeds minDeg (so jitter doesn't count); the first movement only sets the direction. Yaw and
 * pitch reversals within REVERSAL_MERGE_S of each other are one diagonal correction, so diagonal
 * targets aren't penalised versus horizontal ones.
 */
export function countCorrections(samples: Sample[], minDeg = 0.15): number {
  const times = { yaw: [] as number[], pitch: [] as number[] }
  for (const axis of ['yaw', 'pitch'] as const) {
    let dir = 0
    let run = 0
    for (let i = 1; i < samples.length; i++) {
      const d =
        axis === 'yaw'
          ? offsetBetween(samples[i - 1].look, samples[i].look).dYaw
          : samples[i].look.pitch - samples[i - 1].look.pitch
      if (d === 0) continue
      const s = Math.sign(d)
      if (s === dir) {
        run = 0
        continue
      }
      run += Math.abs(d)
      if (run >= minDeg) {
        if (dir !== 0) times[axis].push(samples[i].t)
        dir = s
        run = 0
      }
    }
  }
  // Pair each pitch reversal with at most one unpaired yaw reversal close in time (both lists
  // are already in time order). Same-axis reversals are never merged.
  let paired = 0
  let j = 0
  for (const tp of times.pitch) {
    while (j < times.yaw.length && times.yaw[j] < tp - REVERSAL_MERGE_S) j++
    if (j < times.yaw.length && Math.abs(times.yaw[j] - tp) <= REVERSAL_MERGE_S) {
      paired++
      j++
    }
  }
  return times.yaw.length + times.pitch.length - paired
}

export function evaluateClickTrial(trial: ClickTrial): ClickTrialResult {
  const { start, target, radiusDeg, spawnT, samples, click } = trial
  const clickErrorDeg = click ? angularDistance(click.look, target) : null
  const hit = clickErrorDeg !== null && clickErrorDeg <= radiusDeg
  const { p, dist } = progressAlong(samples, start, target)
  const maxP = p.length ? Math.max(...p) : 0
  const attempted = dist > 0 && maxP >= MIN_ATTEMPT_PROGRESS * dist
  return {
    hit,
    timeMs: hit && click ? (click.t - spawnT) * 1000 : null,
    clickErrorDeg,
    distanceDeg: dist,
    attempted,
    primaryErrorDeg: attempted ? primaryError(samples, start, target) : null,
    overshootDeg: Math.max(0, maxP - dist),
    corrections: countCorrections(samples),
  }
}

export interface ClickSummary {
  trials: number
  hits: number
  hitRate: number
  /** Mean time of hits only; null if no hits. */
  meanTimeMs: number | null
  meanClickErrorDeg: number | null
  meanCorrections: number
  /** Trials with no real attempt (excluded from the primary-error stats below). */
  noAttempt: number
  /** Mean signed primary error (+ over, − under) over attempted trials; null if none. */
  meanPrimaryErrorDeg: number | null
  /** Share of attempted trials whose first movement ended past the target by more than its radius. */
  overshootRate: number
  /** Share of attempted trials whose first movement ended short of the target by more than its radius. */
  undershootRate: number
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function summarizeClickTrials(results: ClickTrialResult[], radiusDeg: number): ClickSummary {
  const n = results.length
  const hitTimes = results.flatMap((r) => (r.hit && r.timeMs !== null ? [r.timeMs] : []))
  const errors = results.flatMap((r) => (r.clickErrorDeg !== null ? [r.clickErrorDeg] : []))
  const primaries = results.flatMap((r) => (r.attempted && r.primaryErrorDeg !== null ? [r.primaryErrorDeg] : []))
  const m = primaries.length
  return {
    trials: n,
    hits: hitTimes.length,
    hitRate: n ? hitTimes.length / n : 0,
    meanTimeMs: mean(hitTimes),
    meanClickErrorDeg: mean(errors),
    meanCorrections: mean(results.map((r) => r.corrections)) ?? 0,
    noAttempt: n - m,
    meanPrimaryErrorDeg: mean(primaries),
    overshootRate: m ? primaries.filter((e) => e > radiusDeg).length / m : 0,
    undershootRate: m ? primaries.filter((e) => e < -radiusDeg).length / m : 0,
  }
}

export interface TrackingSample extends Sample {
  /** Body centre at this sample. */
  target: LookAngles
  /** Frame duration this sample represents, seconds. */
  dt: number
}

export interface TrackingSummary {
  durationS: number
  /** Share of time (dt-weighted) with the crosshair inside the body box. */
  onTargetRatio: number
  /** dt-weighted mean angle from crosshair to body centre. */
  meanErrorDeg: number
}

export function summarizeTracking(samples: TrackingSample[], halfWidthDeg: number, halfHeightDeg: number): TrackingSummary {
  let total = 0
  let onTarget = 0
  let errSum = 0
  for (const s of samples) {
    if (!(s.dt > 0)) continue
    const o = offsetBetween(s.target, s.look)
    total += s.dt
    if (Math.abs(o.dYaw) <= halfWidthDeg && Math.abs(o.dPitch) <= halfHeightDeg) onTarget += s.dt
    errSum += angularDistance(s.look, s.target) * s.dt
  }
  return {
    durationS: total,
    onTargetRatio: total ? onTarget / total : 0,
    meanErrorDeg: total ? errSum / total : 0,
  }
}

/** What a click drill (Flick / Micro) reports when it finishes. */
export interface ClickDrillResult {
  kind: 'flick' | 'micro'
  summary: ClickSummary
  trials: ClickTrialResult[]
}

export interface TrackingResult {
  kind: 'tracking'
  summary: TrackingSummary
}

export type DrillResult = ClickDrillResult | TrackingResult

export type DrillKind = DrillResult['kind']
