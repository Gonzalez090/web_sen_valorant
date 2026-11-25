import { motion } from 'framer-motion'
import { LogOut, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair } from '../components/Crosshair'
import { HitMarker } from '../components/HitMarker'
import { Hud, RoundDots } from '../components/Hud'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Kbd } from '../components/ui/kbd'
import type { DrillDebugState } from '../drills/common'
import { Flick } from '../drills/Flick'
import { Micro } from '../drills/Micro'
import { Tracking } from '../drills/Tracking'
import { lockErrorMessage } from '../hooks/pointerLock'
import { usePointerLock, type RawInputStatus } from '../hooks/usePointerLock'
import { fakeRun } from '../lib/fakeResults'
import { applyInput, newTracker, type LookTracker } from '../lib/look'
import { onLockChange, type Stage } from '../lib/lockStart'
import type { DrillKind, DrillResult } from '../lib/metrics'
import { currentStep, DRILL_EST_S, DRILL_ORDER, progress, type Session, type Step } from '../lib/session'
import { playHit, playMiss } from '../lib/sound'
import { TRACKING } from '../lib/targets'
import { cn, minutesText, radioKeyDown } from '../lib/utils'
import { AimScene } from '../scenes/AimScene'
import { CROSSHAIR_COLORS, useSessionStore } from '../store/useSessionStore'

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


const HIT_MARKER_MS = 120
const COUNTDOWN_FROM = 3
/** FPS below this share of the refresh rate shows a warning. */
const FPS_WARN_RATIO = 0.9
/** FPS must stay low this long before warning, so shader-compile hitches at drill start don't flash it. */
const FPS_WARN_AFTER_MS = 2000

const DRILL_INFO: Record<DrillKind, { name: string; how: string }> = {
  flick: { name: 'Flick', how: 'เป้าโผล่ไกล หมุนไปยิงให้เร็วและแม่น' },
  micro: { name: 'Micro', how: 'เป้าเล็กใกล้เป้าเล็ง ขยับนิดเดียวแล้วยิง' },
  tracking: { name: 'Tracking', how: 'เป้าเดินซ้ายขวา เล็งตามไว้ ไม่ต้องคลิก' },
}

/** Play time of one set (three drills back to back), rounded for the intro text. */
const SET_PLAY_S = Math.round(DRILL_ORDER.reduce((t, k) => t + DRILL_EST_S[k], 0) / 5) * 5

/** Later drills of a set follow straight on; only a set's first drill gets an intro and countdown. */
const startsSet = (step: Step) => step.drill === DRILL_ORDER[0]

const COLOR_NAMES: Record<string, string> = { '#3DDC97': 'เขียว', '#F5F7FA': 'ขาว', '#FFE14D': 'เหลือง', '#4DD8FF': 'ฟ้า', '#FF5CE1': 'ชมพู' }

/** Overlay card pop-in; only shown between drills, never while aiming. */
const cardIn = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.18, ease: 'easeOut' as const },
}

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

/** `session` comes from App so the page keeps its last session while fading out after a reset. */
export function Test({ session }: { session: Session }) {
  const recordDrill = useSessionStore((s) => s.recordDrill)
  const exitToSetup = useSessionStore((s) => s.exitToSetup)
  const soundOn = useSessionStore((s) => s.soundOn)
  const setSound = useSessionStore((s) => s.setSound)
  const crosshairColor = useSessionStore((s) => s.crosshairColor)
  const setCrosshairColor = useSessionStore((s) => s.setCrosshairColor)
  const refreshHz = useSessionStore((s) => s.refreshHz)
  const setRefreshHz = useSessionStore((s) => s.setRefreshHz)
  useRefreshRate(setRefreshHz, refreshHz === null)

  const step = currentStep(session)
  const prog = progress(session)

  const containerRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const tracker = useRef<LookTracker>(newTracker())
  const drillDebug = useRef<DrillDebugState | null>(null)
  const pointer = usePointerLock(containerRef)

  // Stage and restart count belong to one step; a new step starts at its intro.
  const stepKey = step ? `${step.stage}-${step.stage === 'set' ? step.index : 'w'}-${step.drill}` : 'done'
  const [stageState, setStageState] = useState({ key: stepKey, stage: 'intro' as Stage, attempt: 0 })
  const fresh = stageState.key === stepKey
  const chained = step !== null && !startsSet(step) && pointer.locked
  const stage: Stage = fresh ? stageState.stage : chained ? 'playing' : 'intro'
  const attempt = fresh ? stageState.attempt : 0
  // Commit the derived first stage, so pausing a chained drill shows the pause menu, not an intro.
  useEffect(() => {
    if (!fresh) setStageState({ key: stepKey, stage, attempt: 0 })
  }, [fresh, stepKey, stage])
  const setStage = useCallback((s: Stage) => setStageState((prev) => ({ key: stepKey, stage: s, attempt: prev.key === stepKey ? prev.attempt : 0 })), [stepKey])
  const restartDrill = () => {
    drillDebug.current = null
    setStageState({ key: stepKey, stage: 'intro', attempt: attempt + 1 })
  }

  // Clicking the intro while unlocked asks for the lock; the countdown starts once it's granted.
  const [pendingStart, setPendingStart] = useState(false)
  const stageRef = useRef(stage)
  stageRef.current = stage
  // Only a fresh lock (false → true) resumes with a countdown; a chained drill starting while
  // already locked must not, even though setStage changes identity with each step.
  const wasLocked = useRef(pointer.locked)
  useEffect(() => {
    const next = onLockChange({ wasLocked: wasLocked.current, locked: pointer.locked, stage: stageRef.current, pendingStart })
    wasLocked.current = pointer.locked
    if (next.clearPending) setPendingStart(false)
    if (next.stage) setStage(next.stage)
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
    if (stage !== 'intro' || !pointer.locked) return
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) setStage('countdown')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [stage, pointer.locked, setStage])

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

  // The results page needs the cursor back.
  const finished = step === null
  useEffect(() => {
    if (finished) pointer.exit()
  }, [finished, pointer])

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
    let lowSince: number | null = null
    const id = setInterval(() => {
      setDrillSnap(drillDebug.current ? { ...drillDebug.current } : null)
      const fps = Number(fpsRef.current?.textContent)
      const low = refreshHz !== null && fps > 0 && fps < refreshHz * FPS_WARN_RATIO
      const now = performance.now()
      lowSince = low ? (lowSince ?? now) : null
      setFpsLow(lowSince !== null && now - lowSince >= FPS_WARN_AFTER_MS)
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

  const hudRounds = step?.stage === 'warmup' ? undefined : { total: prog.totalSets, done: session.sets.length }
  const roundLabel = `ชุด ${prog.set}/${prog.totalSets}`
  const hudLabel = step?.stage === 'warmup' ? 'วอร์มอัป · ไม่นับคะแนน' : roundLabel
  const drillText =
    drillSnap && stage === 'playing'
      ? `${DRILL_INFO[drillSnap.kind].name} · ${
          drillSnap.kind === 'tracking'
            ? `เหลือ ${Math.max(0, Math.ceil(TRACKING.durationS - drillSnap.clock))} วิ`
            : `เป้า ${Math.min(drillSnap.index + 1, drillSnap.total)}/${drillSnap.total}`
        }`
      : null

  return (
    // The aim room is always dark, whatever theme the other pages use.
    <div ref={containerRef} className="dark fixed inset-0 bg-bg text-fg select-none">
      <AimScene sens={sens} consume={pointer.consume} tracker={tracker} fpsRef={fpsRef}>
        {step?.drill === 'flick' && <Flick key={drillKey} {...drillProps} onComplete={onComplete} />}
        {step?.drill === 'micro' && <Micro key={drillKey} {...drillProps} onComplete={onComplete} />}
        {step?.drill === 'tracking' && <Tracking key={drillKey} {...drillProps} onComplete={onComplete} />}
      </AimScene>
      <Crosshair color={crosshairColor} />
      <HitMarker visible={hitVisible} />
      <Hud
        label={hudLabel}
        rounds={hudRounds}
        drillText={drillText}
        progress={prog.drillsTotal ? prog.drillsDone / prog.drillsTotal : 0}
        fpsRef={fpsRef}
        fpsLow={fpsLow}
      />

      {step && stage === 'intro' && (
        <DrillIntro
          step={step}
          roundLabel={roundLabel}
          sensChanged={step.stage === 'set' && step.index > 0 && startsSet(step)}
          rounds={hudRounds}
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
        <div data-testid="countdown" className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="-translate-y-24 text-center">
            <div className="text-7xl font-bold tabular-nums [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">{count}</div>
            <div className="mt-1 text-sm text-fg/80">{DRILL_INFO[step.drill].name}</div>
          </div>
        </div>
      )}

      {step && stage !== 'intro' && !pointer.locked && (
        <div className="absolute inset-0 grid place-items-center bg-overlay backdrop-blur-md" data-testid="pause-menu">
          <motion.div {...cardIn} className="relative">
            <Card className="w-95 max-w-[calc(100vw-32px)]">
              <h1 className="text-xl font-bold">หยุดชั่วคราว</h1>
              <p className="mt-1 text-sm text-muted">
                {DRILL_INFO[step.drill].name} · เหลือ{minutesText(prog.remainingS)}
              </p>
              <p className="mt-0.5 mb-5 text-xs text-muted">เวลาด่านหยุดเดินระหว่างพัก</p>
              <Button data-testid="resume-button" autoFocus size="lg" className="w-full" onClick={() => void pointer.request()}>
                <Play className="size-4" strokeWidth={2} aria-hidden /> ทำต่อ
              </Button>
              <Button data-testid="restart-drill-button" variant="secondary" className="mt-2 w-full" onClick={restartDrill}>
                <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden /> เริ่มด่านนี้ใหม่
              </Button>
              <Button data-testid="exit-button" variant="secondary" className="mt-2 w-full" onClick={exitToSetup}>
                <LogOut className="size-4" strokeWidth={1.75} aria-hidden /> ออก (บันทึกความคืบหน้าไว้)
              </Button>

              <div className="mt-6 space-y-4 border-t border-line pt-5">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-accent">
                  <span className="flex items-center gap-2 text-muted">
                    {soundOn ? <Volume2 className="size-4" strokeWidth={1.75} aria-hidden /> : <VolumeX className="size-4" strokeWidth={1.75} aria-hidden />}
                    เสียงตอนยิงโดน/พลาด
                  </span>
                  <input type="checkbox" role="switch" data-testid="sound-toggle" checked={soundOn} onChange={(e) => setSound(e.target.checked)} className="sr-only" />
                  <span aria-hidden className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none', soundOn ? 'bg-good' : 'bg-fg/20')}>
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-150 motion-reduce:transition-none',
                        soundOn && 'translate-x-4',
                      )}
                    />
                  </span>
                </label>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted" id="crosshair-label">
                    สี crosshair
                  </span>
                  <div role="radiogroup" aria-labelledby="crosshair-label" className="flex gap-2">
                    {CROSSHAIR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={crosshairColor === c}
                        aria-label={COLOR_NAMES[c]}
                        title={COLOR_NAMES[c]}
                        // Unknown saved colour: keep the first swatch reachable by Tab.
                        tabIndex={crosshairColor === c || (!CROSSHAIR_COLORS.includes(crosshairColor as (typeof CROSSHAIR_COLORS)[number]) && c === CROSSHAIR_COLORS[0]) ? 0 : -1}
                        data-testid={`crosshair-color-${c.slice(1)}`}
                        onClick={() => setCrosshairColor(c)}
                        onKeyDown={(e) => radioKeyDown<string>(e, CROSSHAIR_COLORS, crosshairColor, setCrosshairColor)}
                        className={cn(
                          'size-6 rounded-full border-2 transition-transform duration-150 motion-reduce:transition-none',
                          crosshairColor === c ? 'scale-110 border-fg' : 'border-transparent',
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-5 text-center text-xs text-muted">
                กด <Kbd>Esc</Kbd> ได้ทุกเมื่อเพื่อพัก
              </p>
            </Card>
            <LockError error={pointer.error} />
          </motion.div>
        </div>
      )}
    </div>
  )
}

interface DrillIntroProps {
  step: Step
  /** "ชุด 3/12". */
  roundLabel: string
  /** True at the start of every scored set after the first: tell the player the sens just changed. */
  sensChanged: boolean
  /** Round stepper; omitted during warm-up. */
  rounds?: { total: number; done: number }
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
  const setStart = startsSet(p.step)
  const warmupStart = p.step.stage === 'warmup' && setStart
  const heading = p.step.stage === 'warmup' ? 'วอร์มอัป (ไม่นับคะแนน)' : `${p.roundLabel} · ซ่อนค่าเซนส์ไว้`
  return (
    <div className={cn('absolute inset-0 grid place-items-center backdrop-blur-md', p.locked ? 'bg-bg/35' : 'bg-overlay')} data-testid="drill-intro">
      <motion.div {...cardIn} className="relative">
        <Card className="w-105 max-w-[calc(100vw-32px)] text-center">
          <p className="text-sm text-muted tabular-nums" data-testid="intro-heading">
            {heading}
          </p>
          {p.rounds && <RoundDots {...p.rounds} testId="intro-stepper" className="mt-2 justify-center" />}
          {p.sensChanged && (
            <p data-testid="sens-changed" className="mt-1 text-sm font-medium text-good">
              เปลี่ยนเซนส์แล้ว
            </p>
          )}
          {setStart ? (
            <>
              <h1 className="mt-2 text-3xl font-bold tracking-tight" data-testid="intro-drill">
                3 ด่านต่อกัน ~{SET_PLAY_S} วินาที
              </h1>
              <ol data-testid="intro-set" className="mx-auto mt-4 mb-5 max-w-80 space-y-1.5 text-left text-[15px]">
                {DRILL_ORDER.map((k, i) => (
                  <li key={k} className="flex gap-3">
                    <span className="w-4 shrink-0 text-muted tabular-nums">{i + 1}</span>
                    <span>
                      <b className="font-semibold">{DRILL_INFO[k].name}</b> <span className="text-muted">{DRILL_INFO[k].how}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h1 className="mt-2 text-3xl font-bold tracking-tight" data-testid="intro-drill">
                {info.name}
              </h1>
              <p className="mt-2 mb-5 text-[15px] leading-relaxed">{info.how}</p>
            </>
          )}

          {warmupStart && (
            <ul data-testid="calibration" className="mb-5 space-y-1.5 rounded-xl border border-line bg-bg/60 p-4 text-left text-sm text-muted">
              <li className="flex justify-between gap-3">
                <span className="shrink-0 whitespace-nowrap">จอ</span> <b className="text-fg tabular-nums">{p.refreshHz ? `${p.refreshHz} Hz` : 'กำลังวัด…'}</b>
              </li>
              <li className="flex justify-between gap-3">
                <span className="shrink-0 whitespace-nowrap">Raw input</span> <RawText status={p.rawStatus} />
              </li>
              <li className="pt-1 text-xs">พักได้ตลอดด้วย Esc · ความคืบหน้าบันทึกอัตโนมัติ</li>
            </ul>
          )}
          {!warmupStart && p.rawStatus !== null && p.rawStatus !== 'raw' && (
            <p className="mb-4 text-sm text-warn">ยืนยัน raw input ไม่ได้ ปิด "Enhance pointer precision" ใน Windows ก่อนทดสอบ</p>
          )}
          {p.locked ? (
            <p className="text-base font-semibold" data-testid="click-to-start">
              คลิกเพื่อเริ่ม
            </p>
          ) : (
            <>
              <Button data-testid="start-drill-button" autoFocus size="lg" className="w-full" disabled={p.waiting} onClick={p.onStart}>
                {p.waiting ? 'กำลังล็อกเมาส์…' : 'คลิกเพื่อเริ่ม'}
              </Button>
              <Button data-testid="exit-button" variant="ghost" className="mt-2 w-full" onClick={p.onExit}>
                ออก (บันทึกความคืบหน้าไว้)
              </Button>
            </>
          )}
          <p className="mt-3 text-xs text-muted" data-testid="remaining-time">
            เหลือ{minutesText(p.remainingS)}
          </p>
        </Card>
        <LockError error={p.error} />
      </motion.div>
    </div>
  )
}

/**
 * Pointer-lock failure shown just below a centred card. Positioned outside the card so the card's
 * height never changes and its buttons don't move under the cursor.
 */
function LockError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p data-testid="lock-error" role="alert" className="absolute inset-x-0 top-full mt-3 rounded-xl border border-warn/30 bg-card px-4 py-2.5 text-center text-sm text-warn">
      {lockErrorMessage(error)}
    </p>
  )
}

function RawText({ status }: { status: RawInputStatus | null }) {
  if (status === null) return <b className="text-fg">ตรวจเมื่อเริ่ม</b>
  if (status === 'raw') return <b className="text-good">ทำงาน ✓</b>
  return <b className="text-right text-warn">ยืนยันไม่ได้ · ปิด "Enhance pointer precision" ใน Windows</b>
}
