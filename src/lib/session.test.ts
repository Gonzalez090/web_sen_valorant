import { fakeRun } from './fakeResults'
import type { DrillResult } from './metrics'
import {
  awaitingChoice,
  choose,
  currentStep,
  DRILL_ORDER,
  fineSession,
  FULL_SESSION_EST_S,
  isFinished,
  newSession,
  progress,
  recordDrill,
  summarizeSession,
  type Session,
  type Settings,
} from './session'

const settings: Settings = { dpi: 800, userSens: null, role: 'other' }

/** Plays the current step with a fake result of the given quality. */
function play(s: Session, quality = 0.6, bias = 0): Session {
  const step = currentStep(s)!
  const result: DrillResult = fakeRun(quality, bias)[step.drill]
  return recordDrill(s, result)
}

const playSet = (s: Session, q = 0.6, bias = 0) => DRILL_ORDER.reduce((x) => play(x, q, bias), s)

describe('newSession', () => {
  it('starts at eDPI 280 without a user sens', () => {
    const s = newSession(settings, 1)
    expect(s.startSens).toBeCloseTo(0.35)
    expect(s.psa.base).toBeCloseTo(0.35)
    expect(s.plan!.k).toBe(0.5)
  })

  it('starts at the user sens when given', () => {
    expect(newSession({ ...settings, userSens: 0.5 }, 1).startSens).toBe(0.5)
  })
})

describe('step order', () => {
  it('warm-up first at the start sens, then A then B, each flick → micro → tracking', () => {
    let s = newSession(settings, 7)
    const seen: string[] = []
    while (!awaitingChoice(s)) {
      const step = currentStep(s)!
      seen.push(step.stage === 'warmup' ? `w:${step.drill}` : `${step.candidate}:${step.drill}`)
      if (step.stage === 'warmup') expect(step.sens).toBe(s.startSens)
      else expect(step.sens).toBe(s.plan!.candidates[step.candidate].sens)
      s = play(s)
    }
    expect(seen).toEqual(['w:flick', 'w:micro', 'w:tracking', '0:flick', '0:micro', '0:tracking', '1:flick', '1:micro', '1:tracking'])
    expect(s.warmup).toBeNull()
  })

  it('A and B share the target seed; warm-up uses a different one', () => {
    let s = newSession(settings, 7)
    const warm = currentStep(s)!.seed
    s = playSet(s)
    const a = currentStep(s)!.seed
    s = playSet(s)
    const b = currentStep(s)!.seed
    expect(a).toBe(s.plan!.seed)
    expect(b).toBe(a)
    expect(warm).not.toBe(a)
  })

  it('ignores a result for the wrong drill', () => {
    const s = newSession(settings, 1)
    expect(recordDrill(s, fakeRun().micro)).toBe(s)
  })

  it('fine mode skips the warm-up and uses k = 0.1', () => {
    const s = fineSession(settings, 0.3, 1)
    expect(s.warmup).toBeNull()
    expect(s.plan!.k).toBe(0.1)
    expect(currentStep(s)).toMatchObject({ stage: 'round', candidate: 0, drill: 'flick' })
  })
})

describe('choose', () => {
  it('does nothing before both candidates are done', () => {
    const s = playSet(playSet(newSession(settings, 1)))
    expect(choose(s, 'A', 2)).toBe(s)
  })

  it('moves the base to the winner and plans the next round with a new seed', () => {
    let s = playSet(newSession(settings, 1))
    s = playSet(s, 0.9)
    s = playSet(s, 0.3)
    const winner = s.plan!.candidates[0].sens
    s = choose(s, 'A', 99)
    expect(s.history).toHaveLength(1)
    expect(s.history[0].judgement.winner).toBe('A')
    expect(s.psa.base).toBe(winner)
    expect(s.plan!.index).toBe(1)
    expect(s.plan!.seed).toBe(99)
    expect(s.plan!.k).toBe(0.25)
    expect(s.runs).toEqual([{}, {}])
  })

  it('a full session runs 7 rounds then finishes', () => {
    let s = playSet(newSession(settings, 1))
    for (let i = 0; i < 7; i++) {
      expect(isFinished(s)).toBe(false)
      if (i === 6) expect(s.plan!.kind).toBe('validation')
      s = playSet(playSet(s))
      s = choose(s, 'same', 100 + i)
    }
    expect(isFinished(s)).toBe(true)
    expect(currentStep(s)).toBeNull()
    expect(s.history).toHaveLength(7)
  })

  it('validation tests the lower neighbour after consistent overshoot', () => {
    let s = playSet(newSession(settings, 1))
    for (let i = 0; i < 6; i++) s = choose(playSet(playSet(s, 0.6, 5), 0.6, 5), 'same', 200 + i)
    expect(s.plan!.kind).toBe('validation')
    expect(s.plan!.candidates.map((c) => c.side).sort()).toEqual(['base', 'low'])
  })
})

describe('progress', () => {
  it('counts drills including warm-up and estimates time', () => {
    const s0 = newSession(settings, 1)
    const p0 = progress(s0)
    expect(p0).toMatchObject({ round: 1, totalRounds: 7, drillsDone: 0, drillsTotal: 3 + 7 * 6 })
    expect(p0.remainingS).toBe(FULL_SESSION_EST_S)
    const s1 = play(s0)
    expect(progress(s1).drillsDone).toBe(1)
    expect(progress(s1).remainingS).toBeLessThan(p0.remainingS)
    const s2 = choose(playSet(playSet(playSet(s0))), 'A', 5)
    expect(progress(s2)).toMatchObject({ round: 2, drillsDone: 9 })
  })

  it('full session estimate is in the 10–20 minute window', () => {
    expect(FULL_SESSION_EST_S / 60).toBeGreaterThan(10)
    expect(FULL_SESSION_EST_S / 60).toBeLessThan(20)
  })

  it('reaches 100% and zero time when finished', () => {
    let s = playSet(newSession(settings, 1))
    for (let i = 0; i < 7; i++) s = choose(playSet(playSet(s)), 'A', i)
    const p = progress(s)
    expect(p.drillsDone).toBe(p.drillsTotal)
    expect(p.remainingS).toBe(0)
    expect(p.round).toBe(7)
  })
})

describe('summarizeSession', () => {
  it('reports the base, a ±3% range and the drill profile', () => {
    let s = playSet(newSession(settings, 1))
    for (let i = 0; i < 7; i++) s = choose(playSet(playSet(s)), 'same', i)
    const sum = summarizeSession(s)
    expect(sum.sens).toBe(s.psa.base)
    expect(sum.range[0]).toBeCloseTo(s.psa.base * 0.97)
    expect(sum.range[1]).toBeCloseTo(s.psa.base * 1.03)
    expect(sum.profile).not.toBeNull()
    expect(sum.bias.runs).toBe(14)
  })

  it('has no profile before any round', () => {
    expect(summarizeSession(newSession(settings, 1)).profile).toBeNull()
  })
})
