import {
  errorAfterLockEvent,
  GENERIC_LOCK_ERROR,
  isChromium,
  lockErrorMessage,
  MovementAccumulator,
  requestRawPointerLock,
} from './pointerLock'

function fakeElement(impl: (options?: unknown) => Promise<void> | void) {
  const calls: unknown[] = []
  const el = {
    requestPointerLock(options?: unknown) {
      calls.push(options)
      return impl(options)
    },
  } as unknown as Element
  return { el, calls }
}

const domError = (name: string) => Object.assign(new Error(name), { name })

describe('requestRawPointerLock', () => {
  it("returns 'raw' when Chromium accepts unadjustedMovement", async () => {
    const { el, calls } = fakeElement(() => Promise.resolve())
    await expect(requestRawPointerLock(el, true)).resolves.toBe('raw')
    expect(calls).toEqual([{ unadjustedMovement: true }])
  })

  it("returns 'unverified' when a non-Chromium browser resolves the request", async () => {
    const { el } = fakeElement(() => Promise.resolve())
    await expect(requestRawPointerLock(el, false)).resolves.toBe('unverified')
  })

  it("falls back on NotSupportedError and returns 'fallback'", async () => {
    const { el, calls } = fakeElement((o) =>
      o ? Promise.reject(domError('NotSupportedError')) : Promise.resolve(),
    )
    await expect(requestRawPointerLock(el)).resolves.toBe('fallback')
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined])
  })

  it('falls back when options throw synchronously', async () => {
    const { el } = fakeElement((o) => {
      if (o) throw new TypeError('bad options')
    })
    await expect(requestRawPointerLock(el)).resolves.toBe('fallback')
  })

  it("returns 'unknown' when the API returns no promise", async () => {
    const { el } = fakeElement(() => undefined)
    await expect(requestRawPointerLock(el)).resolves.toBe('unknown')
  })

  it('rethrows other errors (e.g. SecurityError)', async () => {
    const { el } = fakeElement(() => Promise.reject(domError('SecurityError')))
    await expect(requestRawPointerLock(el)).rejects.toMatchObject({ name: 'SecurityError' })
  })

  it('rethrows when the fallback request itself fails', async () => {
    const { el } = fakeElement((o) =>
      Promise.reject(domError(o ? 'NotSupportedError' : 'SecurityError')),
    )
    await expect(requestRawPointerLock(el)).rejects.toMatchObject({ name: 'SecurityError' })
  })
})

describe('MovementAccumulator', () => {
  it('sums deltas and resets on consume', () => {
    const acc = new MovementAccumulator()
    acc.add(3, -2)
    acc.add(5, 1)
    expect(acc.consume()).toEqual({ dx: 8, dy: -1 })
    expect(acc.consume()).toEqual({ dx: 0, dy: 0 })
  })

  it('drops non-finite deltas', () => {
    const acc = new MovementAccumulator()
    expect(acc.add(NaN, 1)).toBe(false)
    expect(acc.add(1, Infinity)).toBe(false)
    expect(acc.add(2, 2)).toBe(true)
    expect(acc.consume()).toEqual({ dx: 2, dy: 2 })
  })
})

describe('isChromium', () => {
  const nav = (brands?: { brand: string }[]) =>
    ({ userAgentData: brands ? { brands } : undefined }) as unknown as Navigator

  it('detects Chromium brands', () => {
    expect(isChromium(nav([{ brand: 'Google Chrome' }, { brand: 'Chromium' }]))).toBe(true)
    expect(isChromium(nav([{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }]))).toBe(true)
  })

  it('is false without userAgentData (Firefox/Safari) or navigator', () => {
    expect(isChromium(nav())).toBe(false)
    expect(isChromium(nav([{ brand: 'Not A Brand' }]))).toBe(false)
    expect(isChromium(undefined)).toBe(false)
  })
})

describe('lockErrorMessage', () => {
  it('asks to wait only for SecurityError', () => {
    expect(lockErrorMessage('SecurityError')).toContain('รอ 1–2 วินาที')
    expect(lockErrorMessage('WrongDocumentError')).not.toContain('รอ 1–2 วินาที')
  })

  it('asks to focus the window for WrongDocumentError', () => {
    expect(lockErrorMessage('WrongDocumentError')).toContain('โฟกัส')
  })

  it('suggests another browser for NotSupportedError', () => {
    expect(lockErrorMessage('NotSupportedError')).toContain('Chrome')
  })

  it('includes the raw name for unknown errors', () => {
    expect(lockErrorMessage('WeirdError')).toContain('WeirdError')
  })
})

describe('errorAfterLockEvent', () => {
  it('keeps a specific error set by the rejected promise', () => {
    expect(errorAfterLockEvent('WrongDocumentError')).toBe('WrongDocumentError')
  })

  it('uses the generic name when nothing was set yet', () => {
    expect(errorAfterLockEvent(null)).toBe(GENERIC_LOCK_ERROR)
  })
})
