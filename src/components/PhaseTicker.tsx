import { useEffect, useRef } from 'react'
import { useExperienceStore } from '../store/experienceStore'

export function PhaseTicker() {
  const unlocked = useExperienceStore((s) => s.unlocked)
  const tickPhaseProgression = useExperienceStore((s) => s.tickPhaseProgression)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (!unlocked) return

    const loop = () => {
      tickPhaseProgression(performance.now())
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [unlocked, tickPhaseProgression])

  return null
}
