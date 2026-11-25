import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Crosshair } from './components/Crosshair'
import { HitMarker } from './components/HitMarker'
import type { ClickDrillResult } from './drills/ClickDrill'
import type { DrillDebugState, DrillKind } from './drills/common'
import { Flick } from './drills/Flick'
import { Micro } from './drills/Micro'
import { Tracking, type TrackingResult } from './drills/Tracking'
import { lockErrorMessage } from './hooks/pointerLock'
import { usePointerLock, type RawInputStatus } from './hooks/usePointerLock'
import { applyInput, newTracker, type LookTracker } from './lib/look'
import { cmPer360, countsToDegrees, edpi, isValidDpi, isValidSens, roundSens } from './lib/sens'
import { playHit, playMiss } from './lib/sound'
import { AimScene } from './scenes/AimScene'

type DrillResult = ClickDrillResult | TrackingResult
type Choice = DrillKind | 'all'

declare global {
  interface Window {
    /** Dev-only hooks for automated testing. */
    __aim?: {
      inject: (dx: number, dy: number) => void
      state: () => LookTracker & { sens: number; dpi: number; locked: boolean }
      reset: () => void
      /** Fake a lock with the given raw status (automation can't get a real lock). */
      simulateLock: (status: RawInputStatus) => void
      simulateUnlock: () => void
      /** Fake a lock error by DOMException name; null clears it. */
      simulateError: (name: string | null) => void
      /** Live drill state: current target, progress, clock. */
      drill: () => DrillDebugState | null
      /** Results of the last run, in drill order. */
      results: () => DrillResult[]
    }
  }
}

const cloneTracker = (t: LookTracker): LookTracker => ({ look: { ...t.look }, totalCounts: { ...t.totalCounts } })
const ALL: DrillKind[] = ['flick', 'micro', 'tracking']
const HIT_MARKER_MS = 120

// Step 3 test page: run each drill and inspect its metrics. Replaced by real pages in step 4.
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const tracker = useRef<LookTracker>(newTracker())
  const drillDebug = useRef<DrillDebugState | null>(null)
  const pointer = usePointerLock(containerRef)
  const lockedRef = useRef(pointer.locked)
  lockedRef.current = pointer.locked

  const [dpiText, setDpiText] = useState('800')
  const [sensText, setSensText] = useState('0.4')
  const [seedText, setSeedText] = useState('1')
  const [choice, setChoice] = useState<Choice>('all')
  const [soundOn, setSoundOn] = useState(true)
  const dpiInput = Number(dpiText)
  const sensInput = Number(sensText)
  const seedInput = Number(seedText)
  const dpiOk = dpiText.trim() !== '' && isValidDpi(dpiInput)
  const sensOk = sensText.trim() !== '' && isValidSens(sensInput)
  const seedOk = seedText.trim() !== '' && Number.isInteger(seedInput) && seedInput >= 0

  // Keep the last valid values so the scene never receives a bad sens.
  const [dpi, setDpi] = useState(800)
  const [sens, setSens] = useState(0.4)
  useEffect(() => {
    if (dpiOk) setDpi(dpiInput)
  }, [dpiOk, dpiInput])
  useEffect(() => {
    if (sensOk) setSens(sensInput)
  }, [sensOk, sensInput])
  const sensRef = useRef(sens)
  sensRef.current = sens

  // A run is a queue of drills played in order with one seed.
  const [run, setRun] = useState<{ id: number; seed: number; queue: DrillKind[] } | null>(null)
  const [results, setResults] = useState<DrillResult[]>([])
  const resultsRef = useRef(results)
  resultsRef.current = results
  const current = run?.queue[0] ?? null

  const start = () => {
    if (!seedOk) return
    drillDebug.current = null
    setResults([])
    setRun({ id: Date.now(), seed: seedInput, queue: choice === 'all' ? ALL : [choice] })
    void pointer.request()
  }

  const cancel = () => {
    setRun(null)
    drillDebug.current = null
  }

  const onComplete = useCallback(
    (r: DrillResult) => {
      setResults((prev) => [...prev, r])
      setRun((prev) => {
        if (!prev) return prev
        const queue = prev.queue.slice(1)
        if (queue.length === 0) {
          pointer.exit()
          return null
        }
        return { ...prev, queue }
      })
    },
    [pointer],
  )

  // Applies pending input immediately so a click is judged on the latest aim.
  const flush = useCallback(() => {
    const { dx, dy } = pointer.consume()
    applyInput(tracker.current, dx, dy, sensRef.current)
  }, [pointer])

  const [hitVisible, setHitVisible] = useState(false)
  const hitTimer = useRef<number>()
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const onShot = useCallback((hit: boolean) => {
    if (soundRef.current) (hit ? playHit : playMiss)()
    if (!hit) return
    setHitVisible(true)
    window.clearTimeout(hitTimer.current)
    hitTimer.current = window.setTimeout(() => setHitVisible(false), HIT_MARKER_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(hitTimer.current), [])

  // Live readout, refreshed 10x/s outside the render loop.
  const [snapshot, setSnapshot] = useState(() => cloneTracker(tracker.current))
  const [drillSnap, setDrillSnap] = useState<DrillDebugState | null>(null)
  useEffect(() => {
    const id = setInterval(() => {
      setSnapshot(cloneTracker(tracker.current))
      setDrillSnap(drillDebug.current ? { ...drillDebug.current } : null)
    }, 100)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__aim = {
      inject: pointer.inject,
      state: () => ({ ...cloneTracker(tracker.current), sens, dpi, locked: lockedRef.current }),
      reset: () => {
        tracker.current = newTracker()
      },
      simulateLock: pointer.simulate.lock,
      simulateUnlock: pointer.simulate.unlock,
      simulateError: pointer.simulate.error,
      drill: () => (drillDebug.current ? { ...drillDebug.current } : null),
      results: () => resultsRef.current,
    }
    return () => {
      delete window.__aim
    }
  }, [pointer.inject, pointer.simulate, sens, dpi])

  const active = pointer.locked && current !== null
  const drillProps = { seed: run?.seed ?? 0, tracker, flush, active, onShot, debugRef: drillDebug }

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, background: '#0B0D10', color: '#F5F7FA', fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}
    >
      <AimScene sens={sens} consume={pointer.consume} tracker={tracker} fpsRef={fpsRef} showMarkers={current === null}>
        {run && current === 'flick' && <Flick key={`${run.id}-flick`} {...drillProps} onComplete={onComplete} />}
        {run && current === 'micro' && <Micro key={`${run.id}-micro`} {...drillProps} onComplete={onComplete} />}
        {run && current === 'tracking' && <Tracking key={`${run.id}-tracking`} {...drillProps} onComplete={onComplete} />}
      </AimScene>
      <Crosshair />
      <HitMarker visible={hitVisible} />

      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: 12, color: '#8A93A3', fontVariantNumeric: 'tabular-nums' }}>
        FPS <span ref={fpsRef} data-testid="fps">-</span>
      </div>

      <div data-testid="debug-panel" style={panelStyle}>
        <div>
          Pointer lock: <b style={{ color: pointer.locked ? '#3DDC97' : '#F5F7FA' }}>{pointer.locked ? 'ON' : 'OFF'}</b> · Raw input:{' '}
          <RawBadge status={pointer.rawStatus} />
        </div>
        <div>
          yaw <span data-testid="yaw">{snapshot.look.yaw.toFixed(2)}</span>° · pitch <span data-testid="pitch">{snapshot.look.pitch.toFixed(2)}</span>° ·
          counts x <span data-testid="counts-x">{snapshot.totalCounts.x}</span> ({countsToDegrees(snapshot.totalCounts.x, sens).toFixed(2)}°)
        </div>
        <div>
          sens {roundSens(sens)} · dpi {dpi} · eDPI {edpi(dpi, sens).toFixed(0)} · cm/360 <span data-testid="cm360">{cmPer360(sens, dpi).toFixed(2)}</span>
        </div>
        {drillSnap && (
          <div data-testid="drill-status">
            drill {drillSnap.kind} · {drillSnap.kind === 'tracking' ? `${drillSnap.clock.toFixed(1)}s` : `${drillSnap.index}/${drillSnap.total}`} · clock{' '}
            {drillSnap.clock.toFixed(2)}s
          </div>
        )}
      </div>

      {!pointer.locked && (
        <div style={overlayStyle}>
          <div style={cardStyle}>
            {run ? (
              <>
                <h1 style={{ margin: '0 0 8px', fontSize: 18 }}>หยุดชั่วคราว</h1>
                <p style={{ color: '#8A93A3', fontSize: 13, margin: '0 0 16px' }}>ด่าน {current} · เวลาหยุดเดินระหว่างพัก</p>
                {pointer.error && (
                  <p data-testid="lock-error" style={warnStyle}>
                    {lockErrorMessage(pointer.error)}
                  </p>
                )}
                <button data-testid="resume-button" onClick={() => void pointer.request()} style={primaryButton}>
                  ทำต่อ
                </button>
                <button data-testid="cancel-button" onClick={cancel} style={secondaryButton}>
                  ยกเลิก
                </button>
              </>
            ) : (
              <>
                <h1 style={{ margin: '0 0 16px', fontSize: 18 }}>ทดสอบด่าน (ขั้นที่ 3)</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Field label="DPI" testId="dpi-input" value={dpiText} onChange={setDpiText} ok={dpiOk} hint="จำนวนเต็ม 100–32000" />
                  <Field label="เซนส์" testId="sens-input" value={sensText} onChange={setSensText} ok={sensOk} hint="มากกว่า 0" />
                  <Field label="Seed" testId="seed-input" value={seedText} onChange={setSeedText} ok={seedOk} hint="จำนวนเต็ม ≥ 0" />
                </div>
                <div role="radiogroup" aria-label="ด่าน" style={{ display: 'flex', gap: 6, margin: '4px 0 12px' }}>
                  {(['all', ...ALL] as Choice[]).map((c) => (
                    <button
                      key={c}
                      role="radio"
                      aria-checked={choice === c}
                      data-testid={`choice-${c}`}
                      onClick={() => setChoice(c)}
                      style={chipStyle(choice === c)}
                    >
                      {c === 'all' ? 'ทั้งหมด' : c}
                    </button>
                  ))}
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 16 }}>
                  <input type="checkbox" data-testid="sound-toggle" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
                  เสียงยิงโดน/พลาด
                </label>
                {pointer.error && (
                  <p data-testid="lock-error" style={warnStyle}>
                    {lockErrorMessage(pointer.error)}
                  </p>
                )}
                <button data-testid="start-button" disabled={!seedOk} onClick={start} style={primaryButton}>
                  เริ่มด่าน
                </button>
                <p style={{ color: '#8A93A3', fontSize: 12, margin: '12px 0 0' }}>คลิกซ้ายเพื่อยิง · กด Esc เพื่อพัก</p>
                {results.length > 0 && <Results results={results} />}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const ms = (x: number | null) => (x === null ? '-' : `${Math.round(x)} ms`)
const deg = (x: number | null) => (x === null ? '-' : `${x.toFixed(2)}°`)
const signed = (x: number | null) => (x === null ? '-' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}°`)

function Results({ results }: { results: DrillResult[] }) {
  return (
    <div data-testid="results" style={{ marginTop: 16, fontSize: 12, lineHeight: 1.7, color: '#8A93A3', fontVariantNumeric: 'tabular-nums' }}>
      {results.map((r) => {
        if (r.kind === 'tracking') {
          const s = r.summary
          return (
            <div key="tracking" data-testid="result-tracking">
              <b style={{ color: '#F5F7FA' }}>Tracking</b> · บนเป้า {pct(s.onTargetRatio)} · ห่างเฉลี่ย {deg(s.meanErrorDeg)} · {s.durationS.toFixed(1)}s
            </div>
          )
        }
        const s = r.summary
        return (
          <div key={r.kind} data-testid={`result-${r.kind}`}>
            <b style={{ color: '#F5F7FA' }}>{r.kind === 'flick' ? 'Flick' : 'Micro'}</b> · โดน {s.hits}/{s.trials} ({pct(s.hitRate)}) · เวลาเฉลี่ย{' '}
            {ms(s.meanTimeMs)} · พลาดเฉลี่ย {deg(s.meanClickErrorDeg)}
            {r.kind === 'flick'
              ? ` · เลยเป้า ${pct(s.overshootRate)} · ไม่ถึง ${pct(s.undershootRate)} · first-move ${signed(s.meanPrimaryErrorDeg)} · ไม่ได้เล็ง ${s.noAttempt}`
              : ` · แก้ทิศเฉลี่ย ${s.meanCorrections.toFixed(1)} ครั้ง`}
          </div>
        )
      })}
    </div>
  )
}

function Field(props: { label: string; testId: string; value: string; onChange: (v: string) => void; ok: boolean; hint: string }) {
  return (
    <label style={{ display: 'block', flex: 1, marginBottom: 8, fontSize: 13 }}>
      {props.label}
      <input data-testid={props.testId} value={props.value} onChange={(e) => props.onChange(e.target.value)} inputMode="decimal" style={inputStyle(props.ok)} />
      {!props.ok && <small style={{ color: '#FFB547' }}>{props.hint}</small>}
    </label>
  )
}

function RawBadge({ status }: { status: RawInputStatus | null }) {
  if (status === null) return <b data-testid="raw-status">-</b>
  if (status === 'raw')
    return (
      <b data-testid="raw-status" style={{ color: '#3DDC97' }}>
        raw ✓
      </b>
    )
  const label = status === 'unverified' ? 'ยืนยัน raw ไม่ได้ในเบราว์เซอร์นี้' : status === 'fallback' ? 'ไม่รองรับ raw' : 'ไม่ทราบ'
  return (
    <b data-testid="raw-status" style={{ color: '#FFB547' }}>
      {status} ({label}) - ปิด "Enhance pointer precision" ใน Windows
    </b>
  )
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 16,
  fontSize: 12,
  lineHeight: 1.6,
  color: '#8A93A3',
  fontVariantNumeric: 'tabular-nums',
  background: 'rgba(11,13,16,0.6)',
  padding: '8px 12px',
  borderRadius: 8,
}
const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(11,13,16,0.55)',
  backdropFilter: 'blur(6px)',
}
const cardStyle: CSSProperties = {
  background: '#171A21',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: 24,
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
}
const warnStyle: CSSProperties = { color: '#FFB547', fontSize: 13 }
const primaryButton: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: 0,
  background: '#FF4655',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
const secondaryButton: CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'transparent',
  color: '#F5F7FA',
  fontSize: 14,
  cursor: 'pointer',
}

function chipStyle(selected: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 8,
    border: `1px solid ${selected ? '#FF4655' : 'rgba(255,255,255,0.12)'}`,
    background: selected ? 'rgba(255,70,85,0.12)' : 'transparent',
    color: '#F5F7FA',
    fontSize: 13,
    cursor: 'pointer',
  }
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
