import { applyRound, FINE_PSA, FULL_PSA, initPsa, isDone, nextBase, planRound, totalRounds, validationSide, type PsaState, type Winner } from './psa'

describe('initPsa', () => {
  it('starts at the given sens with k = 0.5', () => {
    expect(initPsa(0.35)).toEqual({ config: FULL_PSA, base: 0.35, k: 0.5, round: 0 })
  })

  it('rejects bad sens', () => {
    expect(() => initPsa(0)).toThrow(RangeError)
    expect(() => initPsa(NaN)).toThrow(RangeError)
  })

  it('full search is 7 rounds, fine search starts at k = 0.1', () => {
    expect(totalRounds(FULL_PSA)).toBe(7)
    expect(initPsa(0.4, FINE_PSA).k).toBe(0.1)
  })
})

describe('planRound', () => {
  it('compares base × (1 − k) and base × (1 + k)', () => {
    const p = planRound(initPsa(0.4), 1, 'high')
    expect(p.kind).toBe('narrow')
    expect(p.candidates.find((c) => c.side === 'low')!.sens).toBeCloseTo(0.2)
    expect(p.candidates.find((c) => c.side === 'high')!.sens).toBeCloseTo(0.6)
  })

  it('order is shuffled by seed and reproducible', () => {
    const s = initPsa(0.4)
    const orders = new Set<string>()
    for (let seed = 0; seed < 40; seed++) {
      const p = planRound(s, seed, 'high')
      expect(planRound(s, seed, 'high')).toEqual(p)
      orders.add(p.candidates[0].side)
    }
    expect(orders).toEqual(new Set(['low', 'high']))
  })

  it('validation round compares base with the chosen ±5% neighbour', () => {
    const s: PsaState = { ...initPsa(0.4), round: 6, k: 0.5 / 64 }
    const lo = planRound(s, 3, 'low')
    expect(lo.kind).toBe('validation')
    expect(lo.k).toBe(0.05)
    expect(lo.candidates.find((c) => c.side === 'base')!.sens).toBe(0.4)
    expect(lo.candidates.find((c) => c.side === 'low')!.sens).toBeCloseTo(0.38)
    const hi = planRound(s, 3, 'high')
    expect(hi.candidates.find((c) => c.side === 'high')!.sens).toBeCloseTo(0.42)
  })

  it('throws once done', () => {
    expect(() => planRound({ ...initPsa(0.4), round: 7 }, 1, 'low')).toThrow()
  })
})

describe('applyRound', () => {
  it('winner becomes base, k halves', () => {
    const s = initPsa(0.4)
    const p = planRound(s, 1, 'high')
    const lowLabel: Winner = p.candidates[0].side === 'low' ? 'A' : 'B'
    const next = applyRound(s, p, lowLabel)
    expect(next.base).toBeCloseTo(0.2)
    expect(next.k).toBe(0.25)
    expect(next.round).toBe(1)
  })

  it('tie keeps base', () => {
    const s = initPsa(0.4)
    const next = applyRound(s, planRound(s, 1, 'high'), 'tie')
    expect(next.base).toBe(0.4)
    expect(next.k).toBe(0.25)
  })

  it('validation does not change k', () => {
    const s: PsaState = { ...initPsa(0.4), round: 6, k: 0.0078125 }
    const p = planRound(s, 1, 'low')
    const nb = applyRound(s, p, p.candidates[0].side === 'low' ? 'A' : 'B')
    expect(nb.base).toBeCloseTo(0.38)
    expect(nb.k).toBe(0.0078125)
    expect(isDone(nb)).toBe(true)
  })

  it('rejects a stale plan', () => {
    const s = initPsa(0.4)
    const p = planRound(s, 1, 'high')
    expect(() => applyRound(applyRound(s, p, 'tie'), p, 'A')).toThrow()
  })

  it('converges toward a simulated ideal sens', () => {
    // A player whose ideal sens is 0.31: the closer candidate (in log scale) always wins.
    const ideal = 0.31
    let s = initPsa(280 / 800)
    let seed = 100
    while (!isDone(s)) {
      const p = planRound(s, seed++, s.base > ideal ? 'low' : 'high')
      const [a, b] = p.candidates.map((c) => Math.abs(Math.log(c.sens / ideal)))
      s = applyRound(s, p, a < b ? 'A' : b < a ? 'B' : 'tie')
    }
    expect(s.round).toBe(7)
    expect(Math.abs(s.base / ideal - 1)).toBeLessThan(0.05)
  })
})

describe('nextBase', () => {
  it('maps A/B to play order', () => {
    const p = planRound(initPsa(0.4), 1, 'high')
    expect(nextBase(p, 'A')).toBe(p.candidates[0].sens)
    expect(nextBase(p, 'B')).toBe(p.candidates[1].sens)
    expect(nextBase(p, 'tie')).toBe(0.4)
  })
})

describe('validationSide', () => {
  it('overshooting tries lower, undershooting tries higher', () => {
    expect(validationSide(0.3, 1, 1)).toBe('low')
    expect(validationSide(-0.3, -1, 1)).toBe('high')
  })

  it('without a clear bias follows the last move', () => {
    expect(validationSide(0.05, 1, 1)).toBe('high')
    expect(validationSide(null, -1, 1)).toBe('low')
  })

  it('otherwise uses the seed, reproducibly', () => {
    const sides = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      expect(validationSide(null, 0, seed)).toBe(validationSide(null, 0, seed))
      sides.add(validationSide(null, 0, seed))
    }
    expect(sides.size).toBe(2)
  })
})
