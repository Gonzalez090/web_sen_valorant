import { useCallback, useEffect, useRef, useState } from 'react'
import { ABChoice } from '../components/ABChoice'
import { Crosshair } from '../components/Crosshair'
import { HitMarker } from '../components/HitMarker'
import { Hud } from '../components/Hud'
import type { DrillDebugState } from '../drills/common'
import { Flick } from '../drills/Flick'
import { Micro } from '../drills/Micro'
import { Tracking } from '../drills/Tracking'
import { lockErrorMessage } from '../hooks/pointerLock'
import { usePointerLock, type RawInputStatus } from '../hooks/usePointerLock'
import { fakeRun } from '../lib/fakeResults'
import { applyInput, newTracker, type LookTracker } from '../lib/look'
import type { DrillKind, DrillResult } from '../lib/metrics'
import type { CandidateRun } from '../lib/scoring'
import { currentStep, progress, type Step } from '../lib/session'
import { playHit, playMiss } from '../lib/sound'
import { TRACKING } from '../lib/targets'
import { AimScene } from '../scenes/AimScene'
import { useSessionStore } from '../store/useSessionStore'
import { C, card, FONT, minutesText, muted, overlay, primaryButton, secondaryButton, warn } from '../ui/styles'

declare global {
  interface Window {
    /** Dev-only hooks for automated testing. */
    __aim?: {
      inject: (dx: number, dy: number) => void
      state: () => LookTracker & { sens: number; locked: boolean }
      /** Fake a lock with the given raw status (automation can't get a real lock). */
      simulateLock: (status: RawInputStatus) => void
      simulateUnlock: () => void
      /** Fake a lock error by DOMException name; null clears it. */
      simulateError: (name: string | null) => void
      /** Live drill state: current target, progress, clock. */
      drill: () => DrillDebugState | null
      /** Ends the current drill with a synthetic result (quality 0–1, flick first-move error in degrees). */
      finishDrill: (quality?: number, flickErrorDeg?: number) => void
    }
  }
}

type Stage = 'intro' | 'countdown' | 'playing'

const HIT_MARKER_MS = 120
const COUNTDOWN_FROM = 3
/** FPS below this share of the refresh rate shows a warning. */
const FPS_WARN_RATIO = 0.9

const DRILL_INFO: Record<DrillKind, { name: string; how: string }> = {
  flick: { name: 'Flick', how: 'เป้าจะโผล่ห่างจากเป้าเล็ง หมุนไปยิงให้เร็วและแม่นที่สุด' },
  micro: { name: 'Micro-adjust', how: 'เป้าเล็กอยู่ใกล้เป้าเล็ง ขยับนิดเดียวแล้วยิงให้โดน' },
  tracking: { name: 'Tracking', how: 'เป้าเดินซ้ายขวา เล็งตามให้อยู่บนตัวเป้าตลอด ไม่ต้องคลิก' },
}

const labelOf = (c: 0 | 1) => (c === 0 ? 'A' : 'B')

/** Measures the display refresh rate once with requestAnimationFrame (median frame interval). */
function useRefreshRate(onMeasured: (hz: number) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const times: number[] = []
    let id = 0
    const tick = (t: number) => {
      times.push(t)
      if (times.length < 90) {
        id = requestAnimationFrame(tick)
        return
      }
      const gaps = times
        .slice(1)
        .map((x, i) => x - times[i])
        .sort((a, b) => a - b)
      const median = gaps[Math.floor(gaps.length / 2)]
      if (median > 0) onMeasured(Math.round(1000 / median))
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [onMeasured, enabled])
}

export function Test() {
  const session = useSessionStore((s) => s.session)!
  const recordDrill = useSessionStore((s) => s.recordDrill)
  const choose = useSessionStore((s) => s.choose)
  const exitToSetup = useSessionStore((s) => s.exitToSetup)
  const soundOn = useSessionStore((s) => s.soundOn)
  const setSound = useSessionStore((s) => s.setSound)
  const refreshHz = useSessionStore((s) => s.refreshHz)
  const setRefreshHz = useSessionStore((s) => s.setRefreshHz)
  useRefreshRate(setRefreshHz, refreshHz === null)

  const step = currentStep(session)
  const prog = progress(session)
  const choosing = step === null && session.plan !== null

  const containerRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const tracker = useRef<LookTracker>(newTracker())
  const drillDebug = useRef<DrillDebugState | null>(null)
  const pointer = usePointerLock(containerRef)

  // Stage and restart count belong to one step; a new step starts at its intro.
  const stepKey = step ? `${session.plan!.index}-${step.stage}-${step.stage === 'round' ? step.candidate : 'w'}-${step.drill}` : 'choice'
  const [stageState, setStageState] = useState({ key: stepKey, stage: 'intro' as Stage, attempt: 0 })
  const fresh = stageState.key === stepKey
  const stage: Stage = fresh ? stageState.stage : 'intro'
  const attempt = fresh ? stageState.attempt : 0
  const setStage = useCallback((s: Stage) => setStageState((prev) => ({ key: stepKey, stage: s, attempt: prev.key === stepKey ? prev.attempt : 0 })), [stepKey])
  const restartDrill = () => {
    drillDebug.current = null
    setStageState({ key: stepKey, stage: 'intro', attempt: attempt + 1 })
  }

  // Clicking the intro while unlocked asks for the lock; the countdown starts once it's granted.
  const [pendingStart, setPendingStart] = useState(false)
  const stageRef = useRef(stage)
  stageRef.current = stage
  useEffect(() => {
    if (!pointer.locked) return
    if (stageRef.current !== 'intro') setStage('countdown')
    else if (pendingStart) {
      setPendingStart(false)
      setStage('countdown')
    }
  }, [pointer.locked, pendingStart, setStage])
  useEffect(() => {
    if (pointer.error) setPendingStart(false)
  }, [pointer.error])

  const startDrill = () => {
    if (pointer.locked) setStage('countdown')
    else {
      setPendingStart(true)
      void pointer.request()
    }
  }

  // While locked between drills there is no cursor: any left click starts the next drill.
  useEffect(() => {
    if (stage !== 'intro' || !pointer.locked || choosing) return
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) setStage('countdown')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [stage, pointer.locked, choosing, setStage])

  const [count, setCount] = useState(COUNTDOWN_FROM)
  useEffect(() => {
    if (stage !== 'countdown' || !pointer.locked) return
    let n = COUNTDOWN_FROM
    setCount(n)
    const id = window.setInterval(() => {
      n--
      if (n > 0) setCount(n)
      else {
        window.clearInterval(id)
        setStage('playing')
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [stage, pointer.locked, setStage])

  // The A/B choice needs the cursor.
  useEffect(() => {
    if (choosing) pointer.exit()
  }, [choosing, pointer])

  const onComplete = useCallback(
    (r: DrillResult) => {
      drillDebug.current = null
      recordDrill(r)
    },
    [recordDrill],
  )

  const sens = step?.sens ?? session.startSens
  const sensRef = useRef(sens)
  sensRef.current = sens
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

  // HUD readouts, refreshed 10x/s outside the render loop.
  const [drillSnap, setDrillSnap] = useState<DrillDebugState | null>(null)
  const [fpsLow, setFpsLow] = useState(false)
  useEffect(() => {
    const id = setInterval(() => {
      setDrillSnap(drillDebug.current ? { ...drillDebug.current } : null)
      const fps = Number(fpsRef.current?.textContent)
      setFpsLow(refreshHz !== null && fps > 0 && fps < refreshHz * FPS_WARN_RATIO)
    }, 100)
    return () => clearInterval(id)
  }, [refreshHz])

  const stepRef = useRef(step)
  stepRef.current = step
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__aim = {
      inject: pointer.inject,
      state: () => ({ look: { ...tracker.current.look }, totalCounts: { ...tracker.current.totalCounts }, sens: sensRef.current, locked: document.pointerLockElement !== null }),
      simulateLock: pointer.simulate.lock,
      simulateUnlock: pointer.simulate.unlock,
      simulateError: pointer.simulate.error,
      // Only the drill being played; null at intros/countdowns so a finished drill never shows.
      drill: () => (stageRef.current === 'playing' && drillDebug.current ? { ...drillDebug.current } : null),
      finishDrill: (quality = 0.6, flickErrorDeg = 0) => {
        const s = stepRef.current
        if (s) onComplete(fakeRun(quality, flickErrorDeg)[s.drill])
      },
    }
    return () => {
      delete window.__aim
    }
  }, [pointer.inject, pointer.simulate, onComplete])

  const active = pointer.locked && stage === 'playing' && step !== null
  const drillKey = `${stepKey}-${attempt}`
  const drillProps = { seed: step?.seed ?? 0, tracker, flush, active, onShot, debugRef: drillDebug }

  const roundLabel = `รอบ ${prog.round}/${prog.totalRounds}${session.plan?.kind === 'validation' ? ' · ยืนยัน' : ''}`
  const hudLabel = !step ? roundLabel : step.stage === 'warmup' ? 'วอร์มอัป · ไม่นับคะแนน' : `${roundLabel} · เซนส์ ${labelOf(step.candidate)}`
  const drillText =
    drillSnap && stage === 'playing'
      ? drillSnap.kind === 'tracking'
        ? `เหลือ ${Math.max(0, Math.ceil(TRACKING.durationS - drillSnap.clock))} วิ`
        : `เป้า ${Math.min(drillSnap.index + 1, drillSnap.total)}/${drillSnap.total}`
      : null

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, background: C.bg, color: C.text, fontFamily: FONT, userSelect: 'none' }}>
      <AimScene sens={sens} consume={pointer.consume} tracker={tracker} fpsRef={fpsRef}>
        {step?.drill === 'flick' && <Flick key={drillKey} {...drillProps} onComplete={onComplete} />}
        {step?.drill === 'micro' && <Micro key={drillKey} {...drillProps} onComplete={onComplete} />}
        {step?.drill === 'tracking' && <Tracking key={drillKey} {...drillProps} onComplete={onComplete} />}
      </AimScene>
      <Crosshair />
      <HitMarker visible={hitVisible} />
      <Hud
        label={hudLabel}
        rounds={step?.stage === 'warmup' ? undefined : { total: prog.totalRounds, done: session.history.length }}
        drillText={drillText}
        progress={prog.drillsTotal ? prog.drillsDone / prog.drillsTotal : 0}
        fpsRef={fpsRef}
        fpsLow={fpsLow}
      />

      {choosing && (
        <div style={{ ...overlay, background: 'rgba(11,13,16,0.8)' }}>
          <ABChoice round={prog.round} totalRounds={prog.totalRounds} runs={session.runs as [CandidateRun, CandidateRun]} onChoose={choose} />
        </div>
      )}

      {step && stage === 'intro' && (
        <DrillIntro
          step={step}
          roundLabel={roundLabel}
          sensChanged={step.stage === 'round' && step.candidate === 1 && step.drill === 'flick'}
          remainingS={prog.remainingS}
          locked={pointer.locked}
          waiting={pendingStart}
          rawStatus={pointer.rawStatus}
          refreshHz={refreshHz}
          error={pointer.error}
          onStart={startDrill}
          onExit={exitToSetup}
        />
      )}

      {step && stage === 'countdown' && pointer.locked && (
        <div data-testid="countdown" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', transform: 'translateY(-90px)' }}>
            <div style={{ fontSize: 64, fontWeight: 700, fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{count}</div>
            <div style={{ ...muted, color: C.text }}>{DRILL_INFO[step.drill].name}</div>
          </div>
        </div>
      )}

      {step && stage !== 'intro' && !pointer.locked && (
        <div style={overlay} data-testid="pause-menu">
          <div style={{ ...card, width: 380, maxWidth: 'calc(100vw - 32px)' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>หยุดชั่วคราว</h1>
            <p style={{ ...muted, margin: '0 0 16px' }}>
              {DRILL_INFO[step.drill].name} · เหลือ{minutesText(prog.remainingS)} · เวลาด่านหยุดเดินระหว่างพัก
            </p>
            {pointer.error && (
              <p data-testid="lock-error" style={warn}>
                {lockErrorMessage(pointer.error)}
              </p>
            )}
            <button data-testid="resume-button" autoFocus onClick={() => void pointer.request()} style={primaryButton}>
              ทำต่อ
            </button>
            <button data-testid="restart-drill-button" onClick={restartDrill} style={{ ...secondaryButton, marginTop: 8 }}>
              เริ่มด่านนี้ใหม่
            </button>
            <button data-testid="exit-button" onClick={exitToSetup} style={{ ...secondaryButton, marginTop: 8 }}>
              ออก (บันทึกความคืบหน้าไว้)
            </button>
            <label style={{ ...muted, display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
              <input type="checkbox" data-testid="sound-toggle" checked={soundOn} onChange={(e) => setSound(e.target.checked)} />
              เสียงตอนยิงโดน/พลาด
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

interface DrillIntroProps {
  step: Step
  /** "รอบ 3/7" (plus "· ยืนยัน" on the validation round). */
  roundLabel: string
  /** True at B's first drill: tell the player the sens just changed. */
  sensChanged: boolean
  remainingS: number
  locked: boolean
  waiting: boolean
  rawStatus: RawInputStatus | null
  refreshHz: number | null
  error: string | null
  onStart: () => void
  onExit: () => void
}

function DrillIntro(p: DrillIntroProps) {
  const info = DRILL_INFO[p.step.drill]
  const warmupStart = p.step.stage === 'warmup' && p.step.drill === 'flick'
  const heading =
    p.step.stage === 'warmup' ? 'วอร์มอัป (ไม่นับคะแนน)' : `${p.roundLabel} · เซนส์ ${labelOf(p.step.candidate)}`
  return (
    <div style={{ ...overlay, background: p.locked ? 'rgba(11,13,16,0.35)' : overlay.background }} data-testid="drill-intro">
      <div style={{ ...card, width: 420, maxWidth: 'calc(100vw - 32px)', textAlign: 'center' }}>
        <p style={{ ...muted, margin: 0 }} data-testid="intro-heading">
          {heading}
        </p>
        {p.sensChanged && (
          <p data-testid="sens-changed" style={{ color: C.mint, fontSize: 13, margin: '4px 0 0' }}>
            เปลี่ยนเป็นเซนส์ B แล้ว
          </p>
        )}
        <h1 style={{ margin: '8px 0 4px', fontSize: 28 }} data-testid="intro-drill">
          {info.name}
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6 }}>{info.how}</p>

        {warmupStart && (
          <ul data-testid="calibration" style={{ ...muted, listStyle: 'none', padding: 0, margin: '0 0 16px', textAlign: 'left' }}>
            <li>
              จอ: <b style={{ color: C.text }}>{p.refreshHz ? `${p.refreshHz} Hz` : 'กำลังวัด…'}</b>
            </li>
            <li>
              Raw input: <RawText status={p.rawStatus} />
            </li>
            <li>พักได้ตลอดด้วย Esc · ความคืบหน้าบันทึกอัตโนมัติ</li>
          </ul>
        )}
        {!warmupStart && p.rawStatus !== null && p.rawStatus !== 'raw' && (
          <p style={{ ...warn, margin: '0 0 12px' }}>ยืนยัน raw input ไม่ได้ ปิด "Enhance pointer precision" ใน Windows ก่อนทดสอบ</p>
        )}
        {p.error && (
          <p data-testid="lock-error" style={warn}>
            {lockErrorMessage(p.error)}
          </p>
        )}

        {p.locked ? (
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }} data-testid="click-to-start">
            คลิกเพื่อเริ่ม
          </p>
        ) : (
          <>
            <button data-testid="start-drill-button" autoFocus disabled={p.waiting} onClick={p.onStart} style={primaryButton}>
              {p.waiting ? 'กำลังล็อกเมาส์…' : 'คลิกเพื่อเริ่ม'}
            </button>
            <button data-testid="exit-button" onClick={p.onExit} style={{ ...secondaryButton, marginTop: 8, border: 0, color: C.muted }}>
              ออก (บันทึกความคืบหน้าไว้)
            </button>
          </>
        )}
        <p style={{ ...muted, margin: '12px 0 0', fontSize: 12 }} data-testid="remaining-time">
          เหลือ{minutesText(p.remainingS)}
        </p>
      </div>
    </div>
  )
}

function RawText({ status }: { status: RawInputStatus | null }) {
  if (status === null) return <b style={{ color: C.text }}>ตรวจเมื่อเริ่ม</b>
  if (status === 'raw') return <b style={{ color: C.mint }}>ทำงาน ✓</b>
  return <b style={{ color: C.amber }}>ยืนยันไม่ได้ · ปิด "Enhance pointer precision" ใน Windows</b>
}
