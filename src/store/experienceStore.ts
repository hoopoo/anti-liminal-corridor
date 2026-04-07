import { create } from 'zustand'

export type Uncertainty = 'high' | 'medium' | 'low'
export type DecisionChoice = 'approach' | 'ignore' | 'leave'
export type ObserveMode = 'observe' | 'deciding' | 'resolving' | 'resolved'

/**
 * Resolving pipeline: 無反応 → 音のみ → 光 → 最後に HUD/確定
 * （因果を1フレームに畳まない）
 */
export type ResolveStage = 'none' | 'wait' | 'audio' | 'light'

/** Phase 0–2 = auto progression; 3 = P3x after decision (spec §2.1) */
export type PhaseIndex = 0 | 1 | 2 | 3

function logEvent(payload: Record<string, unknown>) {
  console.log('[anti-liminal]', JSON.stringify(payload))
}

/** Decision を早く出すため、後半ロックを短めに */
export const PHASE_DURATIONS_MS = {
  p0_to_p1: 4_500,
  p1_to_p2: 6_500,
  p2_to_deciding: 5_500,
} as const

const SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sess-${Date.now()}`

let pendingResolveTimer1: ReturnType<typeof setTimeout> | null = null
let pendingResolveTimer2: ReturnType<typeof setTimeout> | null = null
let pendingResolveTimer3: ReturnType<typeof setTimeout> | null = null

function clearResolveTimers() {
  if (pendingResolveTimer1) {
    clearTimeout(pendingResolveTimer1)
    pendingResolveTimer1 = null
  }
  if (pendingResolveTimer2) {
    clearTimeout(pendingResolveTimer2)
    pendingResolveTimer2 = null
  }
  if (pendingResolveTimer3) {
    clearTimeout(pendingResolveTimer3)
    pendingResolveTimer3 = null
  }
}

type ExperienceState = {
  unlocked: boolean
  phase: PhaseIndex
  mode: ObserveMode
  resolveStage: ResolveStage
  hoverPreview: DecisionChoice | null
  decision: DecisionChoice | null
  pendingDecision: DecisionChoice | null
  presence: number
  uncertainty: Uncertainty
  startedAt: number
  phaseEnteredAt: number
  decisionAt: number | null
  sessionId: string

  setUnlocked: () => void
  setHoverPreview: (h: DecisionChoice | null) => void
  tickPhaseProgression: (now: number) => void
  choose: (choice: DecisionChoice) => void
  reset: () => void
}

export const useExperienceStore = create<ExperienceState>((set, get) => ({
  unlocked: false,
  phase: 0,
  mode: 'observe',
  resolveStage: 'none',
  hoverPreview: null,
  decision: null,
  pendingDecision: null,
  presence: 0,
  uncertainty: 'high',
  sessionId: SESSION_ID,
  startedAt: performance.now(),
  phaseEnteredAt: performance.now(),
  decisionAt: null,

  setUnlocked: () => {
    const now = performance.now()
    set({
      unlocked: true,
      startedAt: now,
      phaseEnteredAt: now,
    })
    logEvent({
      sessionId: SESSION_ID,
      ts: new Date().toISOString(),
      event: 'audio_unlock',
    })
  },

  setHoverPreview: (h) => {
    if (get().mode !== 'deciding') return
    set({ hoverPreview: h })
  },

  tickPhaseProgression: (now: number) => {
    const s = get()
    if (!s.unlocked || s.mode !== 'observe') return

    const elapsedPhase = now - s.phaseEnteredAt

    if (s.phase === 0 && elapsedPhase >= PHASE_DURATIONS_MS.p0_to_p1) {
      set({
        phase: 1,
        phaseEnteredAt: now,
      })
      logEvent({
        sessionId: SESSION_ID,
        ts: new Date().toISOString(),
        event: 'phase',
        phase: 1,
      })
      return
    }

    if (s.phase === 1 && elapsedPhase >= PHASE_DURATIONS_MS.p1_to_p2) {
      set({
        phase: 2,
        phaseEnteredAt: now,
        presence: 0.22,
        uncertainty: 'high',
      })
      logEvent({
        sessionId: SESSION_ID,
        ts: new Date().toISOString(),
        event: 'phase',
        phase: 2,
      })
      return
    }

    if (s.phase === 2 && elapsedPhase >= PHASE_DURATIONS_MS.p2_to_deciding) {
      set({
        mode: 'deciding',
        phaseEnteredAt: now,
      })
      logEvent({
        sessionId: SESSION_ID,
        ts: new Date().toISOString(),
        event: 'decision_prompt',
        phase: 2,
      })
    }
  },

  choose: (choice: DecisionChoice) => {
    const s = get()
    if (s.mode !== 'deciding') return

    clearResolveTimers()

    const committedAt = performance.now()
    const baseDelay = 700 + Math.random() * 900
    const lightDelay = 300 + Math.random() * 500
    const hudDelay = 400 + Math.random() * 600
    const tLight = baseDelay + lightDelay
    const tHud = tLight + hudDelay

    set({
      mode: 'resolving',
      hoverPreview: null,
      pendingDecision: choice,
      decisionAt: committedAt,
      resolveStage: 'wait',
    })

    logEvent({
      sessionId: SESSION_ID,
      ts: new Date().toISOString(),
      event: 'choice_recorded',
      pick: choice,
      ms_audio: Math.round(baseDelay),
      ms_light: Math.round(tLight),
      ms_hud: Math.round(tHud),
    })

    pendingResolveTimer1 = setTimeout(() => {
      pendingResolveTimer1 = null
      if (get().mode !== 'resolving' || get().pendingDecision !== choice) return
      set({ resolveStage: 'audio' })
      logEvent({
        sessionId: SESSION_ID,
        ts: new Date().toISOString(),
        event: 'resolve_audio',
      })
    }, baseDelay)

    pendingResolveTimer2 = setTimeout(() => {
      pendingResolveTimer2 = null
      if (get().mode !== 'resolving' || get().pendingDecision !== choice) return
      set({ resolveStage: 'light' })
      logEvent({
        sessionId: SESSION_ID,
        ts: new Date().toISOString(),
        event: 'resolve_light',
      })
    }, tLight)

    pendingResolveTimer3 = setTimeout(() => {
      pendingResolveTimer3 = null
      const pick = get().pendingDecision
      if (!pick || get().mode !== 'resolving') return

      let presence: number
      let uncertainty: Uncertainty

      switch (pick) {
        case 'approach':
          presence = 0.88
          uncertainty = 'low'
          break
        case 'ignore':
          presence = 0.38
          uncertainty = 'high'
          break
        case 'leave':
          presence = 0.1
          uncertainty = 'medium'
          break
      }

      const appliedAt = performance.now()
      set({
        mode: 'resolved',
        phase: 3,
        decision: pick,
        pendingDecision: null,
        resolveStage: 'none',
        presence,
        uncertainty,
        phaseEnteredAt: appliedAt,
      })

      logEvent({
        sessionId: SESSION_ID,
        ts: new Date().toISOString(),
        event: 'commit_decision',
        phase: 3,
        pick,
        presence,
        uncertainty,
      })
    }, tHud)
  },

  reset: () => {
    clearResolveTimers()
    const now = performance.now()
    set({
      phase: 0,
      mode: 'observe',
      resolveStage: 'none',
      hoverPreview: null,
      decision: null,
      pendingDecision: null,
      presence: 0,
      uncertainty: 'high',
      startedAt: now,
      phaseEnteredAt: now,
      decisionAt: null,
    })
    logEvent({ sessionId: SESSION_ID, ts: new Date().toISOString(), event: 'reset' })
  },
}))
