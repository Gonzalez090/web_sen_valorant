import { niceTicks } from './niceTicks'

const steps = (t: number[]) => t.slice(1).map((x, i) => Number((x - t[i]).toFixed(9)))

describe('niceTicks', () => {
  it('covers the range with evenly spaced round numbers', () => {
    const { ticks, decimals } = niceTicks(0.125, 0.153)
    expect(ticks[0]).toBeLessThanOrEqual(0.125)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(0.153)
    expect(new Set(steps(ticks)).size).toBe(1)
    expect(decimals).toBe(2)
    expect(ticks).toEqual([0.12, 0.13, 0.14, 0.15, 0.16])
  })

  it('wide range uses fewer decimals', () => {
    const { ticks, decimals } = niceTicks(0.175, 0.525)
    expect(decimals).toBe(1)
    expect(ticks).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
  })

  it('handles a single value and reversed input', () => {
    expect(niceTicks(0.3, 0.3).ticks.length).toBeGreaterThan(1)
    expect(niceTicks(2, 1).ticks).toEqual(niceTicks(1, 2).ticks)
    expect(niceTicks(NaN, 1).ticks).toEqual([])
  })
})
