import {
  countCorrections,
  evaluateClickTrial,
  primaryError,
  summarizeClickTrials,
  summarizeTracking,
  type ClickTrial,
  type Sample,
  type TrackingSample,
} from './metrics'

const start = { yaw: 0, pitch: 0 }
const target = { yaw: 40, pitch: 0 }

/** Yaw path sampled every 10 ms. */
const path = (yaws: number[]): Sample[] => yaws.map((yaw, i) => ({ t: i * 0.01, look: { yaw, pitch: 0 } }))

describe('primaryError', () => {
  it('detects overshoot: fast move past the target, then slow correction', () => {
    const s = path([0, 10, 25, 40, 45, 45.1, 45.1, 44, 42, 40.5, 40])
    expect(primaryError(s, start, target)).toBeCloseTo(5, 5)
  })

  it('detects undershoot: stops short, then creeps in', () => {
    const s = path([0, 10, 22, 32, 34, 34, 34, 34.3, 34.6, 35])
    expect(primaryError(s, start, target)).toBeCloseTo(-6, 1)
  })

  it("stays within the target radius (neither over nor under) for a clean flick", () => {
    const s = path([0, 15, 30, 39, 40, 40, 40])
    expect(Math.abs(primaryError(s, start, target))).toBeLessThanOrEqual(1.2)
  })

  it('is minus the distance when the player never moves', () => {
    expect(primaryError(path([0, 0, 0]), start, target)).toBeCloseTo(-40)
    expect(primaryError([], start, target)).toBeCloseTo(-40)
  })

  it('works across the 180 seam', () => {
    const s = path([170, 175, 180, -175, -172, -172, -172])
    expect(primaryError(s, { yaw: 170, pitch: 0 }, { yaw: -170, pitch: 0 })).toBeCloseTo(-2, 1)
  })
})

describe('countCorrections', () => {
  it('counts direction reversals above the threshold', () => {
    expect(countCorrections(path([0, 1, 2, 1.5, 1.8, 1.6]))).toBe(3)
  })

  it('ignores jitter below the threshold', () => {
    expect(countCorrections(path([0, 1, 2, 1.95, 2, 1.97]))).toBe(0)
  })

  it('counts a diagonal correction (yaw and pitch reverse together) once', () => {
    const s: Sample[] = [0, 2, 4, 5, 4, 3.5].map((v, i) => ({ t: i * 0.01, look: { yaw: v * 2, pitch: v } }))
    expect(countCorrections(s)).toBe(1)
  })

  it('counts yaw and pitch reversals far apart as two', () => {
    const s: Sample[] = [
      [0, 0], [2, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 1], [1, 0],
    ].map(([yaw, pitch], i) => ({ t: i * 0.01, look: { yaw, pitch } }))
    expect(countCorrections(s)).toBe(2)
  })

  it('is 0 for one-way motion', () => {
    expect(countCorrections(path([0, 1, 2, 3, 4]))).toBe(0)
  })
})

describe('evaluateClickTrial', () => {
  const base: ClickTrial = {
    start,
    target,
    radiusDeg: 1.2,
    spawnT: 0,
    samples: path([0, 15, 30, 39, 40, 40]),
    click: { t: 0.05, look: { yaw: 40.5, pitch: 0 } },
  }

  it('hit within radius with time in ms', () => {
    const r = evaluateClickTrial(base)
    expect(r.hit).toBe(true)
    expect(r.timeMs).toBeCloseTo(50)
    expect(r.clickErrorDeg).toBeCloseTo(0.5)
    expect(r.distanceDeg).toBeCloseTo(40)
  })

  it('miss outside radius has no time', () => {
    const r = evaluateClickTrial({ ...base, click: { t: 0.05, look: { yaw: 42, pitch: 0 } } })
    expect(r.hit).toBe(false)
    expect(r.timeMs).toBeNull()
  })

  it('timeout is a miss with no click error', () => {
    const r = evaluateClickTrial({ ...base, click: null })
    expect(r.hit).toBe(false)
    expect(r.clickErrorDeg).toBeNull()
  })

  it('a trial with no real movement is not an undershoot', () => {
    const r = evaluateClickTrial({ ...base, samples: path([0, 0, 0, 2, 5]), click: null })
    expect(r.attempted).toBe(false)
    expect(r.primaryErrorDeg).toBeNull()
  })

  it('counts as attempted from 20% of the distance', () => {
    expect(evaluateClickTrial({ ...base, samples: path([0, 4, 8, 8]) }).attempted).toBe(true)
    expect(evaluateClickTrial({ ...base, samples: path([0, 4, 7.9, 7.9]) }).attempted).toBe(false)
  })

  it('reports how far past the target the aim went', () => {
    const r = evaluateClickTrial({ ...base, samples: path([0, 20, 44, 46, 41, 40]) })
    expect(r.overshootDeg).toBeCloseTo(6)
  })
})

describe('summarizeClickTrials', () => {
  const mk = (hit: boolean, timeMs: number | null, primaryErrorDeg: number | null) => ({
    hit,
    timeMs,
    clickErrorDeg: hit ? 0.5 : 3,
    distanceDeg: 40,
    attempted: primaryErrorDeg !== null,
    primaryErrorDeg,
    overshootDeg: Math.max(0, primaryErrorDeg ?? 0),
    corrections: 2,
  })

  it('aggregates hits, times and over/undershoot rates', () => {
    const s = summarizeClickTrials([mk(true, 400, 3), mk(true, 600, -3), mk(false, null, 0.5), mk(true, 500, 2)], 1.2)
    expect(s.trials).toBe(4)
    expect(s.hits).toBe(3)
    expect(s.hitRate).toBeCloseTo(0.75)
    expect(s.meanTimeMs).toBeCloseTo(500)
    expect(s.overshootRate).toBeCloseTo(0.5)
    expect(s.undershootRate).toBeCloseTo(0.25)
    expect(s.meanCorrections).toBe(2)
  })

  it('leaves no-attempt trials out of over/undershoot and the mean primary error', () => {
    const s = summarizeClickTrials([mk(true, 400, 2), mk(true, 500, -2), mk(false, null, null)], 1.2)
    expect(s.noAttempt).toBe(1)
    expect(s.meanPrimaryErrorDeg).toBeCloseTo(0)
    expect(s.overshootRate).toBeCloseTo(0.5)
    expect(s.undershootRate).toBeCloseTo(0.5)
    expect(s.hitRate).toBeCloseTo(2 / 3)
  })

  it('handles no trials', () => {
    const s = summarizeClickTrials([], 1)
    expect(s.hitRate).toBe(0)
    expect(s.meanTimeMs).toBeNull()
    expect(s.meanPrimaryErrorDeg).toBeNull()
  })
})

describe('summarizeTracking', () => {
  const tgt = { yaw: 10, pitch: 0 }
  const s = (yaw: number, dt: number): TrackingSample => ({ t: 0, dt, look: { yaw, pitch: 0 }, target: tgt })

  it('weights on-target time by frame duration', () => {
    const r = summarizeTracking([s(10, 0.03), s(20, 0.01)], 1.4, 3.5)
    expect(r.durationS).toBeCloseTo(0.04)
    expect(r.onTargetRatio).toBeCloseTo(0.75)
    expect(r.meanErrorDeg).toBeCloseTo(2.5)
  })

  it('skips zero or invalid dt and handles empty input', () => {
    expect(summarizeTracking([s(10, 0), s(10, NaN)], 1, 1).durationS).toBe(0)
    expect(summarizeTracking([], 1, 1).onTargetRatio).toBe(0)
  })
})
