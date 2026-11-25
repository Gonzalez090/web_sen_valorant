import { balancePoint, estimate, FINE_FACTORS, NEAR_BEST, planSweep, shuffled, smoothCurve, WIDE_FACTORS, type SweepPoint } from './sweep'

/** Scores peaking at `best` (log-scale bell), with flicks overshooting above it and undershooting below. */
function bell(best: number, sens: number[], width = 0.4): SweepPoint[] {
  return sens.map((s) => {
    const d = Math.log(s / best)
    return { sens: s, score: 0.3 + 0.5 * Math.exp(-0.5 * (d / width) ** 2), flickLead: 0.3 * d }
  })
}

describe('sweep plans', () => {
  it('wide sweep spans ×0.5 to ×2 in 7 even log steps', () => {
    expect(WIDE_FACTORS).toHaveLength(7)
    expect(WIDE_FACTORS[0]).toBeCloseTo(0.5)
    expect(WIDE_FACTORS[3]).toBeCloseTo(1)
    expect(WIDE_FACTORS[6]).toBeCloseTo(2)
    for (let i = 1; i < 7; i++) expect(WIDE_FACTORS[i] / WIDE_FACTORS[i - 1]).toBeCloseTo(2 ** (1 / 3))
  })

  it('fine sweep is 5 values around 1', () => {
    expect(FINE_FACTORS).toHaveLength(5)
    expect(FINE_FACTORS[2]).toBeCloseTo(1)
    expect(FINE_FACTORS[0]).toBeGreaterThan(0.85)
    expect(FINE_FACTORS[4]).toBeLessThan(1.16)
  })

  it('shuffles reproducibly and keeps every value', () => {
    const a = planSweep(0.4, WIDE_FACTORS, 7)
    expect(planSweep(0.4, WIDE_FACTORS, 7)).toEqual(a)
    expect([...a].sort()).toEqual(WIDE_FACTORS.map((f) => 0.4 * f).sort())
    expect(shuffled([1, 2, 3, 4, 5, 6, 7], 1)).not.toEqual(shuffled([1, 2, 3, 4, 5, 6, 7], 2))
  })
})

describe('smoothCurve', () => {
  it('covers the tested span', () => {
    const c = smoothCurve(bell(0.4, [0.2, 0.4, 0.8]))
    expect(c[0].sens).toBeCloseTo(0.2)
    expect(c[c.length - 1].sens).toBeCloseTo(0.8)
  })

  it('handles one point and none', () => {
    expect(smoothCurve([])).toEqual([])
    expect(smoothCurve([{ sens: 0.4, score: 0.7, flickLead: null }])).toEqual([{ sens: 0.4, score: 0.7 }])
  })
})

describe('balancePoint', () => {
  it('finds where flicks stop over/undershooting', () => {
    expect(balancePoint(bell(0.45, WIDE_FACTORS.map((f) => 0.4 * f)))).toBeCloseTo(0.45, 3)
  })

  it('is null when the trend runs the wrong way, is flat, or there is too little data', () => {
    const pts = bell(0.4, WIDE_FACTORS.map((f) => 0.4 * f))
    expect(balancePoint(pts.map((p) => ({ ...p, flickLead: -(p.flickLead ?? 0) })))).toBeNull()
    expect(balancePoint(pts.map((p) => ({ ...p, flickLead: 0.1 })))).toBeNull()
    expect(balancePoint(pts.slice(0, 3))).toBeNull()
  })

  it('is null when the crossing is outside the tested span', () => {
    expect(balancePoint(bell(2, WIDE_FACTORS.map((f) => 0.4 * f)))).toBeNull()
  })
})

describe('estimate', () => {
  const wide = (start: number) => WIDE_FACTORS.map((f) => start * f)

  it('finds the best sens from a wide sweep that starts off-target', () => {
    const e = estimate(bell(0.3, wide(0.4)))
    expect(e.sens / 0.3).toBeGreaterThan(0.95)
    expect(e.sens / 0.3).toBeLessThan(1.05)
  })

  it('a fine sweep around the first estimate sharpens it', () => {
    const first = estimate(bell(0.33, wide(0.4))).sens
    const all = [...bell(0.33, wide(0.4)), ...bell(0.33, FINE_FACTORS.map((f) => first * f))]
    const e = estimate(all)
    expect(Math.abs(Math.log(e.sens / 0.33))).toBeLessThan(0.02)
  })

  it('range is where the curve stays near the peak and contains the result', () => {
    const e = estimate(bell(0.4, wide(0.4)))
    expect(e.range[0]).toBeLessThanOrEqual(e.sens)
    expect(e.range[1]).toBeGreaterThanOrEqual(e.sens)
    const inside = e.curve.filter((p) => p.sens >= e.range[0] && p.sens <= e.range[1])
    for (const p of inside) expect(p.score).toBeGreaterThanOrEqual(NEAR_BEST * e.peakScore - 1e-12)
  })

  it('a flatter curve gives a wider range', () => {
    const sharp = estimate(bell(0.4, wide(0.4), 0.3))
    const flat = estimate(bell(0.4, wide(0.4), 1.2))
    expect(flat.range[1] / flat.range[0]).toBeGreaterThan(sharp.range[1] / sharp.range[0])
  })

  it('leans toward the flick balance point', () => {
    // Scores peak at 0.4 but flicks balance at 0.45: the result lands between, nearer the peak.
    const pts = bell(0.4, wide(0.4)).map((p) => ({ ...p, flickLead: 0.3 * Math.log(p.sens / 0.45) }))
    const e = estimate(pts)
    expect(e.balanceSens).toBeCloseTo(0.45, 3)
    expect(e.sens).toBeGreaterThan(e.peakSens)
    expect(e.sens).toBeLessThan(0.45)
  })

  it('stays at the peak without flick data', () => {
    const e = estimate(bell(0.4, wide(0.4)).map((p) => ({ ...p, flickLead: null })))
    expect(e.balanceSens).toBeNull()
    expect(e.sens).toBe(e.peakSens)
  })

  it('throws with no points', () => {
    expect(() => estimate([])).toThrow(RangeError)
  })
})
