import { fakeClick, fakeRun, fakeTracking } from './fakeResults'
import {
  CLOSE_MARGIN,
  DRILL_WEIGHTS,
  drillScores,
  flickBias,
  flickScore,
  judge,
  measuredScore,
  microScore,
  totalScores,
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

describe('totalScores', () => {
  it('is 60% measured + 40% feel', () => {
    const a = totalScores(0.5, 0.5, 'A')
    expect(a.a).toBeCloseTo(0.7)
    expect(a.b).toBeCloseTo(0.3)
    const b = totalScores(0.5, 0.5, 'B')
    expect(b.a).toBeCloseTo(0.3)
    expect(b.b).toBeCloseTo(0.7)
    const same = totalScores(1, 0, 'same')
    expect(same.a).toBeCloseTo(0.8)
    expect(same.b).toBeCloseTo(0.2)
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

describe('judge', () => {
  const run = fakeRun(0.6)

  it('picks the clearly better total', () => {
    expect(judge({ sens: 0.3, run: fakeRun(0.8) }, { sens: 0.5, run: fakeRun(0.4) }, 'same', 'other').winner).toBe('A')
    expect(judge({ sens: 0.3, run }, { sens: 0.5, run }, 'B', 'other')).toMatchObject({ winner: 'B', by: 'score' })
  })

  it('feel can outweigh a small measured lead', () => {
    const j = judge({ sens: 0.3, run: fakeRun(0.65) }, { sens: 0.5, run: fakeRun(0.6) }, 'B', 'other')
    expect(j.winner).toBe('B')
  })

  it('is a tie when close with no bias signal', () => {
    const j = judge({ sens: 0.3, run }, { sens: 0.5, run }, 'same', 'other')
    expect(Math.abs(j.total.a - j.total.b)).toBeLessThan(CLOSE_MARGIN)
    expect(j).toMatchObject({ winner: 'tie', by: 'tie' })
  })

  it('when close, overshoot on the higher sens picks the lower one', () => {
    const j = judge({ sens: 0.5, run: fakeRun(0.6, 5) }, { sens: 0.3, run: fakeRun(0.6, 5) }, 'same', 'other')
    // Both overshoot: only the higher sens' bias counts as "too fast".
    expect(j).toMatchObject({ winner: 'B', by: 'bias' })
  })

  it('when close, undershoot on the lower sens picks the higher one', () => {
    const j = judge({ sens: 0.3, run: fakeRun(0.6, -5) }, { sens: 0.5, run }, 'same', 'other')
    expect(j).toMatchObject({ winner: 'B', by: 'bias' })
  })

  it('conflicting signals are a tie', () => {
    const j = judge({ sens: 0.3, run: fakeRun(0.6, -5) }, { sens: 0.5, run: fakeRun(0.6, 5) }, 'same', 'other')
    expect(j.winner).toBe('tie')
  })

  it('role changes the measured weighting', () => {
    const flicky = { ...fakeRun(0.5), flick: fakeRun(1).flick }
    const steady = { ...fakeRun(0.5), tracking: fakeRun(1).tracking }
    const other = judge({ sens: 0.3, run: flicky }, { sens: 0.5, run: steady }, 'same', 'other')
    const duelist = judge({ sens: 0.3, run: flicky }, { sens: 0.5, run: steady }, 'same', 'duelist')
    expect(duelist.measured.a - duelist.measured.b).toBeGreaterThan(other.measured.a - other.measured.b)
  })
})
