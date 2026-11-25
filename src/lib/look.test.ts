import { angularDistance, applyInput, lookToDirection, newTracker, offsetBetween } from './look'

describe('applyInput', () => {
  it('applies counts with the 0.07 formula and totals them', () => {
    const t = newTracker()
    applyInput(t, 100, -100, 0.4)
    expect(t.look.yaw).toBeCloseTo(2.8)
    expect(t.look.pitch).toBeCloseTo(2.8)
    expect(t.totalCounts).toEqual({ x: 100, y: -100 })
  })

  it.each([
    [NaN, 0, 0.4],
    [0, Infinity, 0.4],
    [10, 0, 0],
    [10, 0, NaN],
  ])('ignores bad input (dx=%s, dy=%s, sens=%s)', (dx, dy, sens) => {
    const t = newTracker()
    applyInput(t, dx, dy, sens)
    expect(t).toEqual(newTracker())
  })
})

describe('lookToDirection', () => {
  it('forward is -Z, right is +X, up is +Y', () => {
    const f = lookToDirection({ yaw: 0, pitch: 0 })
    expect(f[0]).toBeCloseTo(0)
    expect(f[1]).toBeCloseTo(0)
    expect(f[2]).toBeCloseTo(-1)
    expect(lookToDirection({ yaw: 90, pitch: 0 })[0]).toBeCloseTo(1)
    expect(lookToDirection({ yaw: 0, pitch: 90 })[1]).toBeCloseTo(1)
  })
})

describe('angularDistance', () => {
  it('matches yaw difference on the horizon, including across the 180 seam', () => {
    expect(angularDistance({ yaw: 0, pitch: 0 }, { yaw: 30, pitch: 0 })).toBeCloseTo(30)
    expect(angularDistance({ yaw: 170, pitch: 0 }, { yaw: -170, pitch: 0 })).toBeCloseTo(20)
  })

  it('shrinks yaw distance at high pitch', () => {
    expect(angularDistance({ yaw: 0, pitch: 60 }, { yaw: 10, pitch: 60 })).toBeLessThan(10)
  })

  it('is 0 for identical looks', () => {
    expect(angularDistance({ yaw: 12, pitch: -5 }, { yaw: 12, pitch: -5 })).toBeCloseTo(0, 5)
  })
})

describe('offsetBetween', () => {
  it('takes the short way round', () => {
    const o = offsetBetween({ yaw: 170, pitch: 0 }, { yaw: -170, pitch: 5 })
    expect(o.dYaw).toBeCloseTo(20)
    expect(o.dPitch).toBeCloseTo(5)
  })
})
