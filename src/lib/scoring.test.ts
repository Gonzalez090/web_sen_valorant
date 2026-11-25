import { fakeClick, fakeRun, fakeTracking } from './fakeResults'
import {
  DRILL_WEIGHTS,
  drillScores,
  flickBias,
  flickLead,
  flickScore,
  measuredScore,
  microScore,
  trackingScore,
} from './scoring'

describe('drill scores', () => {
  it('stay within 0–1 at the extremes', () => {
    for (const q of [0, 1]) {
      const s = drillScores(fakeRun(q))
      for (const v of Object.values(s)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
    expect(flickScore(fakeClick('flick', { hitRate: 1, timeMs: 100, primaryErrorDeg: 0 }))).toBeCloseTo(1)
    expect(flickScore(fakeClick('flick', { hitRate: 0 }))).toBeLessThan(0.21)
  })

  it('rise with better play', () => {
    const lo = drillScores(fakeRun(0.3))
    const hi = drillScores(fakeRun(0.8))
    expect(hi.flick).toBeGreaterThan(lo.flick)
    expect(hi.micro).toBeGreaterThan(lo.micro)
    expect(hi.tracking).toBeGreaterThan(lo.tracking)
  })

  it('flick precision uses first-movement error relative to distance', () => {
    const clean = flickScore(fakeClick('flick', { primaryErrorDeg: 0 }))
    const off = flickScore(fakeClick('flick', { primaryErrorDeg: 10, distanceDeg: 50 }))
    // 10/50 = 0.2 relative error → precision 1/3 → loses 0.2 × 2/3.
    expect(clean - off).toBeCloseTo(0.2 * (2 / 3))
  })

  it('micro rewards fewer corrections', () => {
    expect(microScore(fakeClick('micro', { corrections: 0 }))).toBeGreaterThan(microScore(fakeClick('micro', { corrections: 3 })))
  })

  it('tracking: 70% time on target, 30% distance', () => {
    expect(trackingScore(fakeTracking(1, 0))).toBeCloseTo(1)
    expect(trackingScore(fakeTracking(0.5, 3))).toBeCloseTo(0.35 + 0.15)
    expect(trackingScore(fakeTracking(0, 10))).toBe(0)
  })
})

describe('measuredScore', () => {
  it('weights sum to 1 for each role', () => {
    for (const w of Object.values(DRILL_WEIGHTS)) expect(w.flick + w.micro + w.tracking).toBeCloseTo(1)
  })

  it('uses flick 40 / micro 25 / tracking 35, duelist favours flick', () => {
    const s = { flick: 1, micro: 0, tracking: 0 }
    expect(measuredScore(s, 'other')).toBeCloseTo(0.4)
    expect(measuredScore(s, 'duelist')).toBeGreaterThan(0.4)
    expect(measuredScore({ flick: 0, micro: 1, tracking: 0 }, 'other')).toBeCloseTo(0.25)
    expect(measuredScore({ flick: 0, micro: 0, tracking: 1 }, 'other')).toBeCloseTo(0.35)
  })
})

describe('flickBias', () => {
  it('flags consistent overshoot / undershoot', () => {
    expect(flickBias(fakeClick('flick', { primaryErrorDeg: 5 }).summary)).toBe('over')
    expect(flickBias(fakeClick('flick', { primaryErrorDeg: -5 }).summary)).toBe('under')
    expect(flickBias(fakeClick('flick', { primaryErrorDeg: 0 }).summary)).toBe('none')
  })

  it('ignores errors within the target radius', () => {
    expect(flickBias(fakeClick('flick', { primaryErrorDeg: 1 }).summary)).toBe('none')
  })

  it('needs enough attempted flicks', () => {
    const s = { ...fakeClick('flick', { primaryErrorDeg: 5 }).summary, noAttempt: 10 }
    expect(flickBias(s)).toBe('none')
  })
})

describe('flickLead', () => {
  it('is the mean signed first-movement error relative to the distance', () => {
    expect(flickLead(fakeClick('flick', { primaryErrorDeg: 5, distanceDeg: 50 }))).toBeCloseTo(0.1)
    expect(flickLead(fakeClick('flick', { primaryErrorDeg: -10, distanceDeg: 50 }))).toBeCloseTo(-0.2)
  })

  it('is null when no flick was attempted', () => {
    const r = fakeClick('flick')
    expect(flickLead({ ...r, trials: r.trials.map((t) => ({ ...t, attempted: false })) })).toBeNull()
  })
})
