export type Stage = 'intro' | 'countdown' | 'playing'

/**
 * What the test page does when the pointer-lock state (or a pending start) changes.
 * - Regaining the lock mid-drill (after Esc) resumes with a countdown.
 * - Clicking an intro while unlocked starts the countdown once the lock is granted.
 * - Anything else, notably a chained drill starting while already locked, changes nothing:
 *   later drills of a set follow straight on without a countdown.
 */
export function onLockChange(a: { wasLocked: boolean; locked: boolean; stage: Stage; pendingStart: boolean }): {
  stage: Stage | null
  clearPending: boolean
} {
  if (!a.locked) return { stage: null, clearPending: false }
  if (a.stage !== 'intro') return { stage: a.wasLocked ? null : 'countdown', clearPending: false }
  if (a.pendingStart) return { stage: 'countdown', clearPending: true }
  return { stage: null, clearPending: false }
}
