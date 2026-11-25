import { fakeRun } from './fakeResults'
import { biasInsight, buildInsights, FEEL_MIN_ROUNDS, feelInsight, profileInsight } from './insights'
import type { Preference } from './scoring'
import { choose, currentStep, newSession, recordDrill, type Session } from './session'

const settings = { dpi: 800, userSens: null, role: 'other' as const }

/** Plays a whole session; each candidate's quality / flick bias can depend on its sens. */
function playSession(opts: { pref?: (s: Session) => Preference; bias?: (sens: number) => number; quality?: (sens: number) => number } = {}): Session {
  let s = newSession(settings, 1)
  let seed = 10
  while (s.plan) {
    for (let step = currentStep(s); step; step = currentStep(s)) {
      const q = opts.quality?.(step.sens) ?? 0.6
      const b = opts.bias?.(step.sens) ?? 0
      s = recordDrill(s, fakeRun(q, b)[step.drill])
    }
    s = choose(s, opts.pref?.(s) ?? 'same', seed++)
  }
  return s
}

describe('biasInsight', () => {
  it('balanced when no bias', () => {
    expect(biasInsight(playSession()).text).toContain('สมดุล')
  })

  it('reports overshoot on faster sens', () => {
    // Everything faster than 0.2 overshoots; the result ends up above that, so some runs are faster.
    const s = playSession({ bias: (sens) => (sens > 0.2 ? 5 : 0) })
    const i = biasInsight(s)
    expect(i.tone).toBe('good')
    expect(i.text).toContain('เลยเป้า')
  })

  it('reports undershoot on slower sens', () => {
    const i = biasInsight(playSession({ bias: () => -5 }))
    expect(i.text).toContain('ไม่ถึงเป้า')
  })
})

describe('profileInsight', () => {
  it('names strongest and weakest drill', () => {
    const i = profileInsight({ flick: 0.8, micro: 0.4, tracking: 0.6 })!
    expect(i.text).toContain('Flick')
    expect(i.text).toContain('Micro')
  })

  it('says even when close', () => {
    expect(profileInsight({ flick: 0.6, micro: 0.55, tracking: 0.62 })!.text).toContain('ใกล้เคียง')
  })

  it('null without data', () => {
    expect(profileInsight(null)).toBeNull()
  })
})

describe('feelInsight', () => {
  it('counts agreement between answers and measurement', () => {
    // Lower sens always plays better and the player always picks the lower one → full agreement.
    const pickLow = (s: Session): Preference => (s.plan!.candidates[0].sens < s.plan!.candidates[1].sens ? 'A' : 'B')
    // Only rounds whose measured scores differ by ≥ CLOSE_MARGIN count; late rounds (small k) are too close.
    const s = playSession({ quality: (sens) => 1 - 2 * sens, pref: pickLow })
    const i = feelInsight(s)!
    expect(i.tone).toBe('good')
    const [, agree, total] = i.text.match(/(\d+) จาก (\d+)/)!
    expect(agree).toBe(total)
    expect(Number(total)).toBeGreaterThanOrEqual(FEEL_MIN_ROUNDS)
    expect(Number(total)).toBeLessThan(7)
  })

  it('does not judge the feel when too few rounds differ clearly', () => {
    const pickLow = (s: Session): Preference => (s.plan!.candidates[0].sens < s.plan!.candidates[1].sens ? 'A' : 'B')
    const i = feelInsight(playSession({ quality: (sens) => 0.6 - 0.05 * sens, pref: pickLow }))!
    expect(i.tone).toBe('info')
    expect(i.text).toContain('ใกล้กันมาก')
  })

  it('all "same" answers', () => {
    expect(feelInsight(playSession())!.text).toContain('พอๆ กัน')
  })

  it('null before any round', () => {
    expect(feelInsight(newSession(settings, 1))).toBeNull()
  })
})

describe('buildInsights', () => {
  it('gives 2–3 cards for a finished session', () => {
    const n = buildInsights(playSession()).length
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(3)
  })
})
