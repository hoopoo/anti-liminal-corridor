import { useEffect } from 'react'
import type { AudioProfile } from '../audio/AudioEngine'
import { audioEngine } from '../audio/AudioEngine'
import { useExperienceStore } from '../store/experienceStore'

function resolveProfileBeforeCommit(): AudioProfile {
  const { phase, mode } = useExperienceStore.getState()
  if (mode === 'deciding' || mode === 'resolving') {
    return 'deciding'
  }
  if (phase === 0) return 'p0'
  if (phase === 1) return 'p1'
  return 'p2'
}

export function AudioSync() {
  const unlocked = useExperienceStore((s) => s.unlocked)
  const phase = useExperienceStore((s) => s.phase)
  const mode = useExperienceStore((s) => s.mode)
  const decision = useExperienceStore((s) => s.decision)
  const resolveStage = useExperienceStore((s) => s.resolveStage)
  const hoverPreview = useExperienceStore((s) => s.hoverPreview)

  useEffect(() => {
    if (!unlocked) return
    if (mode === 'resolved' && decision) {
      audioEngine.setProfile(decision)
      return
    }
    if (mode === 'resolving') {
      if (resolveStage === 'wait') {
        audioEngine.setProfile('deciding')
      }
      return
    }
    audioEngine.setProfile(resolveProfileBeforeCommit())
  }, [unlocked, phase, mode, decision, resolveStage])

  useEffect(() => {
    if (!unlocked) return
    if (mode === 'deciding') {
      audioEngine.setHoverHint(hoverPreview)
    } else {
      audioEngine.setHoverHint(null)
    }
  }, [unlocked, mode, hoverPreview])

  useEffect(() => {
    if (!unlocked) return
    let lastStage = useExperienceStore.getState().resolveStage
    return useExperienceStore.subscribe((s) => {
      const cur = s.resolveStage
      if (cur === 'audio' && lastStage !== 'audio' && s.pendingDecision) {
        audioEngine.applyBranchAudioOnly(s.pendingDecision)
      }
      lastStage = cur
    })
  }, [unlocked])

  return null
}
