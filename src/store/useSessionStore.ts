import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { DrillResult } from '../lib/metrics'
import { extendSession, newSession, recordDrill, type Session, type Settings } from '../lib/session'

export type View = 'setup' | 'session'
export type Theme = 'dark' | 'light'

export const CROSSHAIR_COLORS = ['#3DDC97', '#F5F7FA', '#FFE14D', '#4DD8FF', '#FF5CE1'] as const

interface SessionStore {
  /** 'session' shows the test or results; 'setup' can be shown with a session still saved. */
  view: View
  session: Session | null
  /** Last settings used, to prefill the setup page. */
  lastSettings: Settings | null
  soundOn: boolean
  theme: Theme
  crosshairColor: string
  /** Measured display refresh rate (Hz), null until measured. Not persisted. */
  refreshHz: number | null

  start: (settings: Settings) => void
  /** Back to an in-progress session from the setup page. */
  resume: () => void
  recordDrill: (result: DrillResult) => void
  /** "ทดสอบเพิ่ม": one more fine sweep around the result, combined with the data so far. */
  extend: () => void
  /** Leaves to the setup page, keeping the session so it can be resumed. */
  exitToSetup: () => void
  /** Drops the session and the saved form settings, and goes back to setup. */
  reset: () => void
  setSound: (on: boolean) => void
  setTheme: (theme: Theme) => void
  setCrosshairColor: (color: string) => void
  setRefreshHz: (hz: number) => void
}

const randomSeed = () => Math.floor(Math.random() * 0x7fffffff)

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      view: 'setup',
      session: null,
      lastSettings: null,
      soundOn: true,
      theme: 'dark',
      crosshairColor: CROSSHAIR_COLORS[0],
      refreshHz: null,

      start: (settings) => set({ session: newSession(settings, randomSeed()), lastSettings: settings, view: 'session' }),
      resume: () => {
        if (get().session) set({ view: 'session' })
      },
      recordDrill: (result) => {
        const s = get().session
        if (s) set({ session: recordDrill(s, result) })
      },
      extend: () => {
        const s = get().session
        if (s) set({ session: extendSession(s, randomSeed()), view: 'session' })
      },
      exitToSetup: () => set({ view: 'setup' }),
      reset: () => set({ session: null, lastSettings: null, view: 'setup' }),
      setSound: (soundOn) => set({ soundOn }),
      setTheme: (theme) => set({ theme }),
      setCrosshairColor: (crosshairColor) => set({ crosshairColor }),
      setRefreshHz: (refreshHz) => set({ refreshHz }),
    }),
    {
      name: 'sens-finder-session',
      // v2: sensitivity sweep replaced the A/B search; older saved sessions can't be resumed.
      version: 2,
      migrate: (state, version) => {
        const s = (state ?? {}) as Record<string, unknown>
        return (version < 2 ? { ...s, session: null, view: 'setup' } : s) as never
      },
      storage: createJSONStorage(() => localStorage),
      partialize: ({ view, session, lastSettings, soundOn, theme, crosshairColor }) => ({ view, session, lastSettings, soundOn, theme, crosshairColor }),
    },
  ),
)

declare global {
  interface Window {
    /** Dev-only: the session store, for automated testing. */
    __session?: typeof useSessionStore
  }
}

if (import.meta.env.DEV) window.__session = useSessionStore
