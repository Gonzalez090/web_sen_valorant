import { fakeRun } from './fakeResults'
import type { DrillResult } from './metrics'
import { mulberry32 } from './rng'
import { roundSens } from './sens'
import {
  currentStep,
  DRILL_ORDER,
  extendSession,
  FULL_SESSION_EST_S,
  isFinished,
  newSession,
  progress,
  recordDrill,
  summarizeSession,
  type Session,
  type Settings,
} from './session'
import { FINE_FACTORS, WIDE_FACTORS } from './sweep'

const settings: Settings = { dpi: 800, userSens: null, role: 'other' }

/** Quality as a log-scale bell around `best`; flicks overshoot above it and undershoot below. */
const player = (best: number) => (sens: number) => {
  const d = Math.log(sens / best)
  return { q: 0.2 + 0.7 * Math.exp(-0.5 * (d / 0.35) ** 2), bias: 20 * d }
}

/** Plays the current step with a fake result of the given quality. */
function play(s: Session, quality = 0.6, bias = 0): Session {
  const step = currentStep(s)!
  const result: DrillResult = fakeRun(quality, bias)[step.drill]
  return recordDrill(s, result)
}

const playSet = (s: Session, q = 0.6, bias = 0) => DRILL_ORDER.reduce((x) => play(x, q, bias), s)

function playAll(s: Session, p = player(0.3)): Session {
  for (let step = currentStep(s); step; step = currentStep(s)) {
    const { q, bias } = p(step.sens)
    s = recordDrill(s, fakeRun(q, bias)[step.drill])
  }
  return s
}

describe('newSession', () => {
  it('centres the wide sweep on eDPI 280 without a user sens', () => {
    const s = newSession(settings, 1)
    expect(s.startSens).toBeCloseTo(0.35)
    expect([...s.queue].sort()).toEqual(WIDE_FACTORS.map((f) => 0.35 * f).sort())
    expect(s.phase).toBe('wide')
  })

  it('centres on the user sens when given', () => {
    expect(newSession({ ...settings, userSens: 0.5 }, 1).startSens).toBe(0.5)
  })

  it('shuffles the play order by seed', () => {
    expect(newSession(settings, 1).queue).not.toEqual(newSession(settings, 2).queue)
  })
})

describe('steps', () => {
  it('warms up at the start sens first, then plays each set flick → micro → tracking', () => {
    let s = newSession(settings, 1)
    for (const drill of DRILL_ORDER) {
      expect(currentStep(s)).toMatchObject({ stage: 'warmup', drill, sens: s.startSens })
      s = play(s)
    }
    expect(s.warmup).toBeNull()
    expect(s.sets).toHaveLength(0)
    for (const drill of DRILL_ORDER) {
      expect(currentStep(s)).toMatchObject({ stage: 'set', index: 0, drill, sens: s.queue[0] })
      s = play(s)
    }
    expect(s.sets).toHaveLength(1)
  })

  it('every scored set uses the same targets', () => {
    let s = playSet(newSession(settings, 1))
    const seed = currentStep(s)!.seed
    s = playSet(s)
    expect(currentStep(s)!.seed).toBe(seed)
    expect(currentStep(s)!.sens).not.toBe(s.sets[0].sens)
  })

  it('ignores a result for the wrong drill', () => {
    const s = newSession(settings, 1)
    expect(recordDrill(s, fakeRun().micro)).toBe(s)
  })

  it('moves to a fine sweep around the estimate after the wide sweep', () => {
    let s = playSet(newSession(settings, 1))
    for (let i = 0; i < WIDE_FACTORS.length; i++) {
      const { q, bias } = player(0.3)(currentStep(s)!.sens)
      s = playSet(s, q, bias)
    }
    expect(s.phase).toBe('fine')
    expect(s.queue).toHaveLength(FINE_FACTORS.length)
    const center = Math.exp(s.queue.reduce((t, x) => t + Math.log(x), 0) / s.queue.length)
    expect(center / 0.3).toBeGreaterThan(0.9)
    expect(center / 0.3).toBeLessThan(1.1)
  })

  it('finishes after the fine sweep', () => {
    const s = playAll(newSession(settings, 1))
    expect(isFinished(s)).toBe(true)
    expect(currentStep(s)).toBeNull()
    expect(s.sets).toHaveLength(WIDE_FACTORS.length + FINE_FACTORS.length)
  })
})

describe('accuracy', () => {
  it.each([0.18, 0.3, 0.45, 0.6])('finds a player whose best sens is %f (start 0.35)', (best) => {
    const s = playAll(newSession(settings, 3), player(best))
    expect(Math.abs(Math.log(summarizeSession(s).sens / best))).toBeLessThan(0.05)
  })

  it('a player who does best at the start sens gets it back', () => {
    const s = playAll(newSession(settings, 5), player(0.35))
    expect(roundSens(summarizeSession(s).sens)).toBeCloseTo(0.35, 2)
  })
})

describe('extendSession', () => {
  it('adds a fine sweep around the result without a warm-up and keeps the data', () => {
    const done = playAll(newSession(settings, 1))
    const s = extendSession(done, 9)
    expect(isFinished(s)).toBe(false)
    expect(s.warmup).toBeNull()
    expect(s.sets).toBe(done.sets)
    expect(s.queue).toHaveLength(FINE_FACTORS.length)
    expect(currentStep(s)).toMatchObject({ stage: 'set', index: done.sets.length })
    const more = playAll(s)
    expect(more.sets).toHaveLength(done.sets.length + FINE_FACTORS.length)
  })

  it('does nothing while a session is still running', () => {
    const s = newSession(settings, 1)
    expect(extendSession(s, 2)).toBe(s)
  })
})

describe('progress', () => {
  it('counts drills including warm-up and estimates time', () => {
    const s0 = newSession(settings, 1)
    const p0 = progress(s0)
    const sets = WIDE_FACTORS.length + FINE_FACTORS.length
    expect(p0).toMatchObject({ set: 1, totalSets: sets, drillsDone: 0, drillsTotal: 3 * (1 + sets) })
    expect(p0.remainingS).toBe(FULL_SESSION_EST_S)
    const s1 = play(s0)
    expect(progress(s1).drillsDone).toBe(1)
    expect(progress(s1).remainingS).toBeLessThan(p0.remainingS)
    expect(progress(playSet(playSet(s0)))).toMatchObject({ set: 2, drillsDone: 6 })
  })

  it('full session estimate is about 5 minutes', () => {
    expect(FULL_SESSION_EST_S / 60).toBeGreaterThan(4)
    expect(FULL_SESSION_EST_S / 60).toBeLessThan(7)
  })

  it('reaches 100% and zero time when finished', () => {
    const p = progress(playAll(newSession(settings, 1)))
    expect(p.drillsDone).toBe(p.drillsTotal)
    expect(p.remainingS).toBe(0)
  })

  it('an extension counts only its own sets as remaining', () => {
    const s = extendSession(playAll(newSession(settings, 1)), 4)
    const p = progress(s)
    expect(p.totalSets).toBe(s.sets.length + FINE_FACTORS.length)
    expect(p.drillsTotal - p.drillsDone).toBe(3 * FINE_FACTORS.length)
  })
})

describe('summarizeSession', () => {
  it('reports the result, a range around it, the curve and the drill profile', () => {
    const s = playAll(newSession(settings, 1))
    const sum = summarizeSession(s)
    expect(sum.range[0]).toBeLessThanOrEqual(roundSens(sum.sens))
    expect(sum.range[1]).toBeGreaterThanOrEqual(roundSens(sum.sens))
    expect(sum.range).toEqual(sum.range.map(roundSens))
    expect(sum.points).toHaveLength(s.sets.length)
    expect(sum.curve.length).toBeGreaterThan(10)
    expect(sum.profile).not.toBeNull()
    expect(sum.bias.runs).toBe(s.sets.length)
  })

  it('sees overshoot on faster sets and undershoot on slower ones', () => {
    const b = summarizeSession(playAll(newSession(settings, 1))).bias
    expect(b.overWhenFaster).toBeGreaterThan(0)
    expect(b.underWhenSlower).toBeGreaterThan(0)
  })

  it('throws before any set is played', () => {
    expect(() => summarizeSession(newSession(settings, 1))).toThrow(RangeError)
  })
})

describe('accuracy with noisy play', () => {
  it('lands within ±10% of the true best sens in most sessions despite set-to-set noise', () => {
    const results: number[] = []
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed * 7919)
      const best = 0.2 + 0.4 * rng()
      let s = newSession(settings, seed)
      let noise = 0
      for (let step = currentStep(s); step; step = currentStep(s)) {
        // One noise draw per set (a good or bad set), ±0.08 quality, plus ±4° flick wobble.
        if (step.drill === 'flick') noise = (rng() * 2 - 1) * 0.08
        const d = Math.log(step.sens / best)
        const q = 0.2 + 0.7 * Math.exp(-0.5 * (d / 0.35) ** 2) + noise
        s = recordDrill(s, fakeRun(q, 20 * d + (rng() * 2 - 1) * 4)[step.drill])
      }
      results.push(Math.abs(Math.log(summarizeSession(s).sens / best)))
    }
    const within10 = results.filter((e) => e < Math.log(1.1)).length / results.length
    expect(within10).toBeGreaterThanOrEqual(0.85)
  })
})
