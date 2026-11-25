import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Crosshair } from './components/Crosshair'
import { lockErrorMessage } from './hooks/pointerLock'
import { usePointerLock, type RawInputStatus } from './hooks/usePointerLock'
import { cmPer360, countsToDegrees, edpi, isValidDpi, isValidSens, roundSens } from './lib/sens'
import { AimScene, type LookTracker } from './scenes/AimScene'

declare global {
  interface Window {
    /** Dev-only hooks for automated testing of the camera formula. */
    __aim?: {
      inject: (dx: number, dy: number) => void
      state: () => LookTracker & { sens: number; dpi: number; locked: boolean }
      reset: () => void
      /** Fake a lock with the given raw status (automation can't get a real lock). */
      simulateLock: (status: RawInputStatus) => void
      simulateUnlock: () => void
      /** Fake a lock error by DOMException name; null clears it. */
      simulateError: (name: string | null) => void
    }
  }
}

const newTracker = (): LookTracker => ({ look: { yaw: 0, pitch: 0 }, totalCounts: { x: 0, y: 0 } })
const cloneTracker = (t: LookTracker): LookTracker => ({ look: { ...t.look }, totalCounts: { ...t.totalCounts } })

// Step 2 test page: camera rotation in the aim scene. Replaced by real pages in step 4.
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const tracker = useRef<LookTracker>(newTracker())
  const pointer = usePointerLock(containerRef)

  const [dpiText, setDpiText] = useState('800')
  const [sensText, setSensText] = useState('0.4')
  const dpiInput = Number(dpiText)
  const sensInput = Number(sensText)
  const dpiOk = dpiText.trim() !== '' && isValidDpi(dpiInput)
  const sensOk = sensText.trim() !== '' && isValidSens(sensInput)

  // Keep the last valid values so the scene never receives a bad sens.
  const [dpi, setDpi] = useState(800)
  const [sens, setSens] = useState(0.4)
  useEffect(() => {
    if (dpiOk) setDpi(dpiInput)
  }, [dpiOk, dpiInput])
  useEffect(() => {
    if (sensOk) setSens(sensInput)
  }, [sensOk, sensInput])

  // Live readout, refreshed 10×/s outside the render loop.
  const [snapshot, setSnapshot] = useState(() => cloneTracker(tracker.current))
  useEffect(() => {
    const id = setInterval(() => setSnapshot(cloneTracker(tracker.current)), 100)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__aim = {
      inject: pointer.inject,
      state: () => ({ ...cloneTracker(tracker.current), sens, dpi, locked: pointer.locked }),
      reset: () => {
        tracker.current = newTracker()
      },
      simulateLock: pointer.simulate.lock,
      simulateUnlock: pointer.simulate.unlock,
      simulateError: pointer.simulate.error,
    }
    return () => {
      delete window.__aim
    }
  }, [pointer.inject, pointer.simulate, pointer.locked, sens, dpi])

  const unwrappedYaw = countsToDegrees(snapshot.totalCounts.x, sens)

  return (
    <div
      ref={containerRef}
      onClick={() => void pointer.request()}
      style={{ position: 'fixed', inset: 0, background: '#0B0D10', color: '#F5F7FA', fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}
    >
      <AimScene sens={sens} consume={pointer.consume} tracker={tracker} fpsRef={fpsRef} showMarkers />
      <Crosshair />

      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 12, color: '#8A93A3', fontVariantNumeric: 'tabular-nums' }}>
        FPS <span ref={fpsRef} data-testid="fps">–</span>
      </div>

      <div
        data-testid="debug-panel"
        style={{ position: 'absolute', top: 12, left: 16, fontSize: 12, lineHeight: 1.6, color: '#8A93A3', fontVariantNumeric: 'tabular-nums', background: 'rgba(11,13,16,0.6)', padding: '8px 12px', borderRadius: 8 }}
      >
        <div>Pointer lock: <b style={{ color: pointer.locked ? '#3DDC97' : '#F5F7FA' }}>{pointer.locked ? 'ON' : 'OFF'}</b></div>
        <div>Raw input: <RawBadge status={pointer.rawStatus} /></div>
        <div>yaw <span data-testid="yaw">{snapshot.look.yaw.toFixed(2)}</span>° · pitch <span data-testid="pitch">{snapshot.look.pitch.toFixed(2)}</span>°</div>
        <div>counts x <span data-testid="counts-x">{snapshot.totalCounts.x}</span> → {unwrappedYaw.toFixed(2)}° total</div>
        <div>sens {roundSens(sens)} · dpi {dpi} · eDPI {edpi(dpi, sens).toFixed(0)} · cm/360 <span data-testid="cm360">{cmPer360(sens, dpi).toFixed(2)}</span></div>
      </div>

      {!pointer.locked && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(11,13,16,0.55)', backdropFilter: 'blur(6px)' }}
        >
          <div style={{ background: '#171A21', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, width: 340 }}>
            <h1 style={{ margin: '0 0 16px', fontSize: 18 }}>ทดสอบการหมุนกล้อง (ขั้นที่ 2)</h1>
            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
              DPI
              <input data-testid="dpi-input" value={dpiText} onChange={(e) => setDpiText(e.target.value)} inputMode="numeric" style={inputStyle(dpiOk)} />
              {!dpiOk && <small style={{ color: '#FFB547' }}>DPI ต้องเป็นจำนวนเต็ม 100–32000</small>}
            </label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
              เซนส์
              <input data-testid="sens-input" value={sensText} onChange={(e) => setSensText(e.target.value)} inputMode="decimal" style={inputStyle(sensOk)} />
              {!sensOk && <small style={{ color: '#FFB547' }}>เซนส์ต้องมากกว่า 0</small>}
            </label>
            {pointer.error && (
              <p data-testid="lock-error" style={{ color: '#FFB547', fontSize: 13 }}>
                {lockErrorMessage(pointer.error)}
              </p>
            )}
            <button
              data-testid="lock-button"
              onClick={() => void pointer.request()}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: 0, background: '#FF4655', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              คลิกเพื่อเริ่มเล็ง
            </button>
            <p style={{ color: '#8A93A3', fontSize: 12, margin: '12px 0 0' }}>กด Esc เพื่อปล่อยเมาส์</p>
          </div>
        </div>
      )}
    </div>
  )
}

function RawBadge({ status }: { status: RawInputStatus | null }) {
  if (status === null) return <b data-testid="raw-status">–</b>
  if (status === 'raw') return <b data-testid="raw-status" style={{ color: '#3DDC97' }}>raw ✓</b>
  const label = status === 'unverified' ? 'ยืนยัน raw ไม่ได้ในเบราว์เซอร์นี้' : status === 'fallback' ? 'ไม่รองรับ raw' : 'ไม่ทราบ'
  return (
    <b data-testid="raw-status" style={{ color: '#FFB547' }}>
      {status} ({label}) — ปิด "Enhance pointer precision" ใน Windows
    </b>
  )
}

function inputStyle(ok: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    marginTop: 4,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${ok ? 'rgba(255,255,255,0.12)' : '#FFB547'}`,
    background: '#0B0D10',
    color: '#F5F7FA',
    fontSize: 16,
  }
}
