import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { DrillResult } from '../lib/metrics'
import type { Preference } from '../lib/scoring'
import { roundSens } from '../lib/sens'
import { choose, fineSession, newSession, recordDrill, type Session, type Settings } from '../lib/session'

export type View = 'setup' | 'session'

interface SessionStore {
  /** 'session' shows the test or results; 'setup' can be shown with a session still saved. */
  view: View
  session: Session | null
  /** Last settings used, to prefill the setup page. */
  lastSettings: Settings | null
  soundOn: boolean
  /** Measured display refresh rate (Hz), null until measured. Not persisted. */
  refreshHz: number | null

  start: (settings: Settings) => void
  /** Back to an in-progress session from the setup page. */
  resume: () => void
  recordDrill: (result: DrillResult) => void
  choose: (pref: Preference) => void
  /** New search from the current result with k = 0.1. */
  fineTune: () => void
  /** Leaves to the setup page, keeping the session so it can be resumed. */
  exitToSetup: () => void
  /** Drops the session and goes back to setup. */
  reset: () => void
  setSound: (on: boolean) => void
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
      refreshHz: null,

      start: (settings) => set({ session: newSession(settings, randomSeed()), lastSettings: settings, view: 'session' }),
      resume: () => {
        if (get().session) set({ view: 'session' })
      },
      recordDrill: (result) => {
        const s = get().session
        if (s) set({ session: recordDrill(s, result) })
      },
      choose: (pref) => {
        const s = get().session
        if (s) set({ session: choose(s, pref, randomSeed()) })
      },
      fineTune: () => {
        const s = get().session
        // Start from the value the player saw and copied, not the unrounded base.
        if (s) set({ session: fineSession(s.settings, roundSens(s.psa.base), randomSeed()), view: 'session' })
      },
      exitToSetup: () => set({ view: 'setup' }),
      reset: () => set({ session: null, view: 'setup' }),
      setSound: (soundOn) => set({ soundOn }),
      setRefreshHz: (refreshHz) => set({ refreshHz }),
    }),
    {
      name: 'sens-finder-session',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ view, session, lastSettings, soundOn }) => ({ view, session, lastSettings, soundOn }),
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
