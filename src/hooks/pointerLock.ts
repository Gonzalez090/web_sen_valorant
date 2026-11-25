/**
 * Whether the browser gave us raw (unaccelerated) mouse input.
 * - 'raw': Chromium accepted `unadjustedMovement`.
 * - 'unverified': lock succeeded but the browser isn't Chromium, which may silently ignore
 *   `unadjustedMovement` (Firefox/Safari), so raw input can't be confirmed.
 * - 'fallback': browser rejected `unadjustedMovement`; OS acceleration may apply.
 * - 'unknown': the API returned no promise, so support can't be confirmed (older Firefox/Safari).
 */
export type RawInputStatus = 'raw' | 'unverified' | 'fallback' | 'unknown'

/** Only Chromium-based browsers actually honour `unadjustedMovement`. */
export function isChromium(nav: Navigator | undefined = globalThis.navigator): boolean {
  const brands = (nav as (Navigator & { userAgentData?: { brands?: { brand: string }[] } }) | undefined)
    ?.userAgentData?.brands
  return Array.isArray(brands) && brands.some((b) => b.brand === 'Chromium')
}

/** User-facing (Thai) message for a pointer lock failure, keyed by DOMException name. */
export function lockErrorMessage(name: string): string {
  switch (name) {
    case 'SecurityError':
      return 'เบราว์เซอร์ยังไม่ให้ล็อกเมาส์ รอ 1–2 วินาทีแล้วคลิกอีกครั้ง'
    case 'WrongDocumentError':
      return 'คลิกที่หน้าเว็บให้หน้าต่างโฟกัสก่อน แล้วลองอีกครั้ง'
    case 'NotSupportedError':
      return 'เบราว์เซอร์นี้ไม่รองรับการล็อกเมาส์ ลองใช้ Chrome หรือ Edge'
    default:
      return `ล็อกเมาส์ไม่สำเร็จ (${name}) ลองคลิกอีกครั้ง`
  }
}

type RequestPointerLock = (options?: { unadjustedMovement?: boolean }) => Promise<void> | void

function isPromise(value: unknown): value is Promise<void> {
  return typeof (value as Promise<void> | undefined)?.then === 'function'
}

function isNotSupported(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'NotSupportedError'
}

async function requestPlain(request: RequestPointerLock): Promise<void> {
  const result = request()
  if (isPromise(result)) await result
}

/**
 * Requests pointer lock with raw input, falling back to a normal lock if raw input isn't supported.
 * Rejects with the browser's error for other failures (e.g. SecurityError when re-locking too soon
 * after the user pressed Esc, or when not called from a user gesture).
 */
export async function requestRawPointerLock(
  el: Element,
  chromium: boolean = isChromium(),
): Promise<RawInputStatus> {
  const request = (el.requestPointerLock as RequestPointerLock).bind(el)
  let result: Promise<void> | void
  try {
    result = request({ unadjustedMovement: true })
  } catch (error) {
    // Some engines throw synchronously on unknown options.
    if (!isNotSupported(error) && !(error instanceof TypeError)) throw error
    await requestPlain(request)
    return 'fallback'
  }

  if (!isPromise(result)) return 'unknown'

  try {
    await result
    return chromium ? 'raw' : 'unverified'
  } catch (error) {
    if (!isNotSupported(error)) throw error
    await requestPlain(request)
    return 'fallback'
  }
}

/** Generic name used when only the 'pointerlockerror' event (no DOMException) is available. */
export const GENERIC_LOCK_ERROR = 'PointerLockError'

/**
 * Next error name after a 'pointerlockerror' event. The event carries no detail and may fire after
 * the request promise already rejected with a specific name, so it must never overwrite that.
 */
export function errorAfterLockEvent(prev: string | null): string {
  return prev ?? GENERIC_LOCK_ERROR
}

/** Accumulates mouse counts between frames. Non-finite deltas are dropped. */
export class MovementAccumulator {
  private dx = 0
  private dy = 0

  add(movementX: number, movementY: number): boolean {
    if (!Number.isFinite(movementX) || !Number.isFinite(movementY)) return false
    this.dx += movementX
    this.dy += movementY
    return true
  }

  /** Returns counts since the last consume and resets. */
  consume(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy }
    this.dx = 0
    this.dy = 0
    return out
  }
}
