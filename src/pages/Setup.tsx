import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Armchair, ArrowRight, Check, ChevronDown, Clock, Gauge, History, Monitor, RectangleHorizontal, Trophy, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Role } from '@/lib/scoring'
import { FULL_SESSION_EST_S, isFinished, progress } from '@/lib/session'
import { DPI_MAX, DPI_MIN, isValidDpi, isValidSens, roundSens } from '@/lib/sens'
import { cn, minutesText, radioKeyDown } from '@/lib/utils'
import { useSessionStore } from '@/store/useSessionStore'

const DPI_PRESETS = [400, 800, 1600]

const CHECKLIST: { id: string; title: string; detail: string; icon: LucideIcon }[] = [
  { id: 'accel', title: 'ปิด mouse acceleration', detail: 'Windows: ปิด "Enhance pointer precision"', icon: Gauge },
  { id: 'pad', title: 'ใช้แผ่นรองเมาส์ที่เล่นจริง', detail: 'พื้นผิวต่างกัน ความรู้สึกต่างกัน', icon: RectangleHorizontal },
  { id: 'posture', title: 'นั่งท่าที่เล่นจริง', detail: 'ระยะแขนและมุมข้อมือเหมือนตอนเล่น', icon: Armchair },
]

const ROLES: [Role, string][] = [
  ['duelist', 'Duelist'],
  ['other', 'อื่นๆ'],
]

const ROLE_VALUES = ROLES.map(([r]) => r)

const fadeUp =(i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: 'easeOut' as const, delay: i * 0.05 },
})

const DESKTOP_QUERY = '(pointer: coarse), (max-width: 1023px)'

/** True on touch-first or narrow screens, where the aim test can't be played. */
function useNeedsDesktop(): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY)
    if (!mq) return
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return match
}

function chipClass(selected: boolean) {
  return cn(
    'h-10 flex-1 rounded-lg border text-sm font-medium tabular-nums transition-colors duration-150',
    selected ? 'border-accent bg-accent/10 text-fg' : 'border-line-strong text-muted hover:border-fg/25 hover:text-fg',
  )
}

export function Setup() {
  const session = useSessionStore((s) => s.session)
  const last = useSessionStore((s) => s.lastSettings)
  const start = useSessionStore((s) => s.start)
  const resume = useSessionStore((s) => s.resume)
  const reset = useSessionStore((s) => s.reset)
  const needsDesktop = useNeedsDesktop()
  const reduceMotion = useReducedMotion()
  /** Clearing saved progress asks once more before it happens. */
  const [confirmClear, setConfirmClear] = useState(false)

  const [dpiText, setDpiText] = useState(String(last?.dpi ?? ''))
  const [sensText, setSensText] = useState(last?.userSens ? String(last.userSens) : '')
  const [role, setRole] = useState<Role>(last?.role ?? 'other')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [touched, setTouched] = useState(false)
  const [moreOpen, setMoreOpen] = useState(last?.userSens != null || last?.role === 'duelist')

  // Plain digits only: Number() alone would also accept "1e3" or "0x320".
  const dpi = /^\d+$/.test(dpiText.trim()) ? Number(dpiText.trim()) : NaN
  const dpiOk = isValidDpi(dpi)
  const sensBlank = sensText.trim() === ''
  const sens = /^(\d+\.?\d*|\.\d+)$/.test(sensText.trim()) ? Number(sensText.trim()) : NaN
  const sensOk = sensBlank || isValidSens(sens)
  const canStart = dpiOk && sensOk
  const dpiError = touched && !dpiOk

  const inProgress = session !== null && !isFinished(session)
  const finished = session !== null && isFinished(session)
  const prog = session && inProgress ? progress(session) : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!canStart) {
      if (!sensOk) setMoreOpen(true)
      return
    }
    start({ dpi, userSens: sensBlank ? null : sens, role })
  }

  return (
    <main className="flex min-h-screen justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-lg">
        <motion.header {...fadeUp(0)} className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">หาเซนส์ที่ใช่สำหรับคุณ</h1>
          <p className="mt-3 text-base text-muted">เล็งในห้องซ้อม เทียบเซนส์ทีละคู่ จนเหลือค่าที่คุณคุมได้ดีที่สุด</p>
        </motion.header>

        {needsDesktop && (
          <motion.div {...fadeUp(1)}>
            <Card data-testid="desktop-notice" className="mb-4 flex items-start gap-4 border-warn/30 p-5">
              <Monitor className="mt-0.5 size-5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
              <div>
                <p className="font-semibold">ต้องใช้คอมพิวเตอร์และเมาส์ในการทดสอบ</p>
                <p className="mt-1 text-sm text-muted">เปิดหน้านี้บนคอมที่ใช้เล่นเกม เพื่อให้ผลตรงกับมือคุณจริงๆ</p>
              </div>
            </Card>
          </motion.div>
        )}

        {inProgress && prog && (
          <motion.div {...fadeUp(1)}>
            <Card data-testid="resume-card" className="mb-4">
              <div className="flex items-center gap-3">
                <History className="size-5 text-accent-text" strokeWidth={1.75} aria-hidden />
                <h2 className="text-lg font-semibold">มีการทดสอบค้างอยู่</h2>
              </div>
              <p className="mt-1 mb-5 text-sm text-muted tabular-nums">
                {session.warmup ? 'วอร์มอัป' : `รอบ ${prog.round}/${prog.totalRounds}`} · เหลือ{minutesText(prog.remainingS)}
              </p>
              <Button data-testid="resume-session" autoFocus size="lg" className="w-full" onClick={resume}>
                ทำต่อจากที่ค้างไว้ <ArrowRight className="size-5" strokeWidth={2} aria-hidden />
              </Button>
            </Card>
          </motion.div>
        )}

        {finished && (
          <motion.div {...fadeUp(1)}>
            <Card data-testid="last-result-card" className="mb-4 flex items-center justify-between gap-3 p-5">
              <span className="flex items-center gap-3 text-sm text-muted">
                <Trophy className="size-5 text-good" strokeWidth={1.75} aria-hidden />
                ผลล่าสุด <b className="text-lg font-bold text-fg tabular-nums">{roundSens(session.psa.base).toFixed(3)}</b>
              </span>
              <Button data-testid="view-last-result" variant="secondary" size="sm" onClick={resume}>
                ดูผล
              </Button>
            </Card>
          </motion.div>
        )}

        <motion.div {...fadeUp(2)}>
          <Card>
            <form onSubmit={submit} noValidate>
              <label htmlFor="dpi" className="text-sm font-semibold">
                DPI ของเมาส์
              </label>
              <Input
                id="dpi"
                data-testid="dpi-input"
                inputMode="numeric"
                autoComplete="off"
                autoFocus={!inProgress}
                placeholder="800"
                value={dpiText}
                onChange={(e) => setDpiText(e.target.value)}
                aria-invalid={dpiError}
                aria-describedby="dpi-help"
                className="mt-2 h-20 text-center text-5xl font-bold tracking-tight tabular-nums"
              />
              <div className="mt-3 flex gap-2" role="group" aria-label="DPI ยอดนิยม">
                {DPI_PRESETS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    data-testid={`dpi-preset-${d}`}
                    aria-pressed={dpiText === String(d)}
                    onClick={() => setDpiText(String(d))}
                    className={chipClass(dpiText === String(d))}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p id="dpi-help" data-testid="dpi-help" className={cn('mt-3 text-sm', dpiError ? 'text-warn' : 'text-muted')}>
                {dpiError ? `ใส่ DPI เป็นจำนวนเต็ม ${DPI_MIN}–${DPI_MAX}` : 'ดูค่า DPI ได้จากโปรแกรมของเมาส์ (เช่น G HUB, Synapse)'}
              </p>

              <div className="mt-6 border-t border-line pt-4" data-testid="more-options" data-open={moreOpen}>
                <button
                  type="button"
                  data-testid="more-options-toggle"
                  aria-expanded={moreOpen}
                  aria-controls="more-options-panel"
                  onClick={() => setMoreOpen(!moreOpen)}
                  className="flex w-full items-center justify-between rounded-lg py-1 text-sm font-medium text-muted hover:text-fg"
                >
                  ตัวเลือกเพิ่มเติม
                  <ChevronDown className={cn('size-4 transition-transform duration-200 motion-reduce:transition-none', moreOpen && 'rotate-180')} strokeWidth={1.75} aria-hidden />
                </button>
                <AnimatePresence initial={false}>
                  {moreOpen && (
                    <motion.div
                      id="more-options-panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      // MotionConfig's reducedMotion only drops transforms; height needs turning off here.
                      transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-0.5 pt-4 pb-1">
                        <label htmlFor="sens" className="block text-sm">
                          เซนส์ที่ใช้อยู่ตอนนี้ <span className="text-muted">(ไม่บังคับ ใช้เป็นจุดเริ่มต้น)</span>
                        </label>
                        <Input
                          id="sens"
                          data-testid="sens-input"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="เช่น 0.35"
                          value={sensText}
                          onChange={(e) => setSensText(e.target.value)}
                          aria-invalid={!sensOk}
                          aria-describedby={sensOk ? undefined : 'sens-error'}
                          className="mt-2 tabular-nums"
                        />
                        {!sensOk && (
                          <p id="sens-error" className="mt-1.5 text-sm text-warn">
                            ใส่ตัวเลขมากกว่า 0
                          </p>
                        )}
                        <div className="mt-4 text-sm" id="role-label">
                          บทบาทที่เล่นบ่อย
                        </div>
                        <div role="radiogroup" aria-labelledby="role-label" className="mt-2 flex gap-2">
                          {ROLES.map(([r, label]) => (
                            <button
                              type="button"
                              key={r}
                              role="radio"
                              aria-checked={role === r}
                              tabIndex={role === r ? 0 : -1}
                              data-testid={`role-${r}`}
                              onClick={() => setRole(r)}
                              onKeyDown={(e) => radioKeyDown(e, ROLE_VALUES, role, setRole)}
                              className={chipClass(role === r)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {role === 'duelist' && <p className="mt-2 text-xs text-muted">Duelist: ให้น้ำหนักกับการ flick มากขึ้น</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <fieldset className="mt-6">
                <legend className="mb-3 text-sm font-semibold">ก่อนเริ่ม</legend>
                <div className="grid gap-2">
                  {CHECKLIST.map((c) => {
                    const on = !!checked[c.id]
                    const Icon = c.icon
                    return (
                      <label
                        key={c.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                          on ? 'border-good/40 bg-good/5' : 'border-line hover:border-line-strong',
                        )}
                      >
                        <input
                          type="checkbox"
                          data-testid={`check-${c.id}`}
                          checked={on}
                          onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })}
                          className="sr-only"
                        />
                        <Icon className={cn('size-5 shrink-0', on ? 'text-good' : 'text-muted')} strokeWidth={1.75} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{c.title}</span>
                          <span className="block text-xs text-muted">{c.detail}</span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            'grid size-5 shrink-0 place-items-center rounded-md border transition-colors duration-150',
                            on ? 'border-good bg-good text-bg' : 'border-line-strong',
                          )}
                        >
                          {on && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <p data-testid="time-estimate" className="mt-6 mb-3 flex items-center justify-center gap-1.5 text-sm text-muted">
                <Clock className="size-4" strokeWidth={1.75} aria-hidden />
                ใช้เวลา{minutesText(FULL_SESSION_EST_S)} · พักได้ตลอด
              </p>
              <Button type="submit" data-testid="start-button" aria-disabled={!canStart} size="lg" variant={inProgress ? 'secondary' : 'primary'} className="w-full">
                {inProgress ? (
                  'เริ่มใหม่ทั้งหมด'
                ) : (
                  <>
                    เริ่มหาเซนส์ <ArrowRight className="size-5" strokeWidth={2} aria-hidden />
                  </>
                )}
              </Button>
              {inProgress && <p className="mt-2 text-center text-xs text-muted">เริ่มใหม่จะลบความคืบหน้าที่ค้างอยู่</p>}
            </form>
          </Card>
        </motion.div>

        {session && !confirmClear && (
          <p className="mt-6 text-center">
            <button data-testid="clear-session" onClick={() => setConfirmClear(true)} className="rounded text-xs text-muted underline underline-offset-4 hover:text-fg">
              ล้างข้อมูลที่บันทึกไว้
            </button>
          </p>
        )}
        {session && confirmClear && (
          <div data-testid="clear-confirm" role="alertdialog" aria-labelledby="clear-confirm-text" className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span id="clear-confirm-text" className="text-muted">
              {inProgress ? 'ความคืบหน้าที่ทำค้างไว้จะหายทั้งหมด ล้างเลยไหม?' : 'ผลล่าสุดจะหายไป ล้างเลยไหม?'}
            </span>
            <Button
              data-testid="clear-confirm-yes"
              variant="secondary"
              size="sm"
              className="border-warn/50 text-warn"
              onClick={() => {
                setConfirmClear(false)
                reset()
                setDpiText('')
                setSensText('')
                setRole('other')
                setTouched(false)
                setMoreOpen(false)
              }}
            >
              ล้างเลย
            </Button>
            <Button data-testid="clear-confirm-no" variant="ghost" size="sm" autoFocus onClick={() => setConfirmClear(false)}>
              ยกเลิก
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
