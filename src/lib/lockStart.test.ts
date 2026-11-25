import { onLockChange } from './lockStart'

describe('onLockChange', () => {
  it('a chained drill starting while locked plays straight on (no countdown)', () => {
    expect(onLockChange({ wasLocked: true, locked: true, stage: 'playing', pendingStart: false }).stage).toBeNull()
  })

  it('regaining the lock mid-drill resumes with a countdown', () => {
    expect(onLockChange({ wasLocked: false, locked: true, stage: 'playing', pendingStart: false }).stage).toBe('countdown')
  })

  it('a pending intro click starts the countdown once locked', () => {
    expect(onLockChange({ wasLocked: false, locked: true, stage: 'intro', pendingStart: true })).toEqual({ stage: 'countdown', clearPending: true })
  })

  it('an intro without a click waits', () => {
    expect(onLockChange({ wasLocked: false, locked: true, stage: 'intro', pendingStart: false }).stage).toBeNull()
  })

  it('does nothing while unlocked', () => {
    expect(onLockChange({ wasLocked: true, locked: false, stage: 'playing', pendingStart: true }).stage).toBeNull()
  })
})
