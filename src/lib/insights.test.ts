import { fakeRun } from './fakeResults'
import { biasInsight, buildInsights, confidenceInsight, drillProfile, profileInsight } from './insights'
import { currentStep, extendSession, newSession, recordDrill, summarizeSession, type Session, type SessionSummary } from './session'

const settings = { dpi: 800, userSens: null, role: 'other' as const }

/** Plays a whole session; quality / flick bias can depend on the sens being played. */
function playSession(opts: { bias?: (sens: number) => number; quality?: (sens: number) => number } = {}): Session {
  let s = newSession(settings, 1)
  for (let step = currentStep(s); step; step = currentStep(s)) {
    const q = opts.quality?.(step.sens) ?? 0.2 + 0.7 * Math.exp(-0.5 * (Math.log(step.sens / 0.35) / 0.35) ** 2)
    const b = opts.bias?.(step.sens) ?? 0
    s = recordDrill(s, fakeRun(q, b)[step.drill])
  }
  return s
}

const summary = (opts?: Parameters<typeof playSession>[0]) => summarizeSession(playSession(opts))

describe('biasInsight', () => {
  it('balanced when no bias', () => {
    expect(biasInsight(summary()).text).toContain('สมดุล')
  })

  it('confirms the result when faster sets overshoot and slower ones undershoot', () => {
    const i = biasInsight(summary({ bias: (sens) => 20 * Math.log(sens / 0.35) }))
    expect(i.tone).toBe('good')
    expect(i.text).toContain('ตรงกลางพอดี')
  })

  it('reports overshoot on faster sens', () => {
    const i = biasInsight(summary({ bias: (sens) => (sens > 0.37 ? 5 : 0) }))
    expect(i.tone).toBe('good')
    expect(i.text).toContain('เลยเป้า')
  })

  it('reports undershoot on slower sens', () => {
    const i = biasInsight(summary({ bias: () => -5 }))
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

describe('confidenceInsight', () => {
  const base = (over: Partial<SessionSummary>): SessionSummary => ({ ...summary(), ...over })
  /** Curve over 0.175–0.7 with scores from `f(ln(sens/0.35))`. */
  const curve = (f: (x: number) => number) =>
    Array.from({ length: 41 }, (_, i) => {
      const sens = 0.175 * 4 ** (i / 40)
      return { sens, score: f(Math.log(sens / 0.35)) }
    })

  it('clear when the curve falls away on both sides of the peak', () => {
    const i = confidenceInsight(base({ sens: 0.35, range: [0.3, 0.41], tested: [0.175, 0.7], curve: curve((x) => 0.9 * Math.exp(-2 * x * x)) }))
    expect(i.tone).toBe('good')
    expect(i.text).toContain('ผลชัดเจน')
    expect(i.text).toContain('0.300')
  })

  it('a clear peak stays clear even with a wide near-best range', () => {
    const i = confidenceInsight(base({ sens: 0.35, range: [0.262, 0.346], tested: [0.175, 0.7], curve: curve((x) => 0.9 * Math.exp(-2 * x * x)) }))
    expect(i.tone).toBe('good')
  })

  it('asks for more sets when scores are all close', () => {
    const i = confidenceInsight(base({ sens: 0.35, range: [0.2, 0.6], tested: [0.175, 0.7], curve: curve((x) => 0.6 - 0.02 * x * x) }))
    expect(i.tone).toBe('warn')
    expect(i.text).toContain('ใกล้กันมาก')
    expect(i.text).toContain('ทดสอบเพิ่ม')
  })

  it('not clear when the score only falls on one side', () => {
    const i = confidenceInsight(base({ sens: 0.35, range: [0.3, 0.6], tested: [0.175, 0.7], curve: curve((x) => (x < 0 ? 0.8 + x * 0.5 : 0.8 - x * 0.02)) }))
    expect(i.tone).toBe('warn')
    expect(i.text).not.toContain('ใกล้กันมาก')
    expect(i.text).toContain('ทดสอบเพิ่ม')
  })

  it('warns when the best value is at the edge of what was tested', () => {
    const i = confidenceInsight(base({ sens: 0.7, range: [0.69, 0.7], tested: [0.175, 0.7] }))
    expect(i.tone).toBe('warn')
    expect(i.text).toContain('ขอบ')
  })

  it('a peaked session reads as clear, and stays clear after "ทดสอบเพิ่ม"', () => {
    const quality = (sens: number) => 0.9 * Math.exp(-0.5 * (Math.log(sens / 0.3) / 0.25) ** 2)
    let s = playSession({ quality })
    expect(confidenceInsight(summarizeSession(s)).tone).toBe('good')
    s = extendSession(s, 7)
    for (let step = currentStep(s); step; step = currentStep(s)) s = recordDrill(s, fakeRun(quality(step.sens), 0)[step.drill])
    expect(s.sets.length).toBe(17)
    expect(confidenceInsight(summarizeSession(s)).tone).toBe('good')
  })
})

describe('drillProfile', () => {
  it('agrees with profileInsight on even scores', () => {
    const p = { flick: 0.55, micro: 0.48, tracking: 0.52 }
    expect(drillProfile(p).even).toBe(true)
    expect(profileInsight(p)!.text).toContain('ใกล้เคียง')
    expect(drillProfile({ flick: 0.8, micro: 0.4, tracking: 0.6 })).toEqual({ best: 'flick', worst: 'micro', even: false })
  })
})

describe('buildInsights', () => {
  it('gives 2–3 cards for a finished session', () => {
    const n = buildInsights(playSession()).length
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(3)
  })
})
