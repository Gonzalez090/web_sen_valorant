import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  errorAfterLockEvent,
  GENERIC_LOCK_ERROR,
  MovementAccumulator,
  requestRawPointerLock,
  type RawInputStatus,
} from './pointerLock'

export type { RawInputStatus } from './pointerLock'

export interface PointerLock {
  locked: boolean
  /** null until the first successful lock. */
  rawStatus: RawInputStatus | null
  /** Last lock error name (e.g. 'SecurityError'), cleared on successful lock. */
  error: string | null
  /** Must be called from a user gesture (click). */
  request: () => Promise<void>
  exit: () => void
  /** Mouse counts since the last call. Call once per frame. */
  consume: () => { dx: number; dy: number }
  /** Adds counts as if they came from the mouse (dev/testing only). */
  inject: (dx: number, dy: number) => void
  /**
   * Dev/testing only: fakes lock state so overlays and badges can be checked without a real lock
   * (automated browsers often refuse pointer lock). Pass null to clear a simulated error.
   */
  simulate: {
    lock: (status: RawInputStatus) => void
    unlock: () => void
    error: (name: string | null) => void
  }
}

/**
 * Pointer lock with raw input. Reads movementX/Y from every mousemove event while locked
 * and accumulates them; never uses cursor position.
 */
export function usePointerLock(targetRef: RefObject<HTMLElement>): PointerLock {
  const [locked, setLocked] = useState(false)
  const [rawStatus, setRawStatus] = useState<RawInputStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const accRef = useRef(new MovementAccumulator())

  useEffect(() => {
    const onChange = () => {
      const el = targetRef.current
      setLocked(el !== null && document.pointerLockElement === el)
      // Drop anything gathered across the lock boundary.
      accRef.current.consume()
    }
    const onMove = (e: MouseEvent) => {
      const el = targetRef.current
      if (el === null || document.pointerLockElement !== el) return
      accRef.current.add(e.movementX, e.movementY)
    }
    // The event has no detail and can arrive after the promise rejected with a specific name.
    const onError = () => setError(errorAfterLockEvent)
    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('pointerlockerror', onError)
    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('pointerlockerror', onError)
      document.removeEventListener('mousemove', onMove)
    }
  }, [targetRef])

  const request = useCallback(async () => {
    const el = targetRef.current
    if (!el || document.pointerLockElement === el) return
    // Clear the previous attempt's error so the event handler can't keep a stale name.
    setError(null)
    try {
      const status = await requestRawPointerLock(el)
      setRawStatus(status)
      setError(null)
    } catch (e) {
      // The specific DOMException name wins over the generic event, whichever arrives first.
      setError((e as { name?: string } | null)?.name ?? GENERIC_LOCK_ERROR)
    }
  }, [targetRef])

  const exit = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock()
  }, [])

  const consume = useCallback(() => accRef.current.consume(), [])
  const inject = useCallback((dx: number, dy: number) => {
    accRef.current.add(dx, dy)
  }, [])

  const simulate = useMemo(
    () => ({
      lock: (status: RawInputStatus) => {
        setLocked(true)
        setRawStatus(status)
        setError(null)
      },
      unlock: () => setLocked(false),
      error: (name: string | null) => setError(name),
    }),
    [],
  )

  return { locked, rawStatus, error, request, exit, consume, inject, simulate }
}
