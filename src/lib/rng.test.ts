import { mulberry32, randRange, randSign } from './rng'

describe('mulberry32', () => {
  it('same seed gives same sequence; different seed differs', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const sa = Array.from({ length: 5 }, a)
    expect(Array.from({ length: 5 }, b)).toEqual(sa)
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa)
  })

  it('stays in [0, 1)', () => {
    const r = mulberry32(1)
    for (let i = 0; i < 10000; i++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('randRange and randSign stay in bounds', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const x = randRange(r, 15, 90)
      expect(x).toBeGreaterThanOrEqual(15)
      expect(x).toBeLessThan(90)
      expect([-1, 1]).toContain(randSign(r))
    }
  })
})
