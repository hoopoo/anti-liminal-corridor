import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback } from 'react'
import { audioEngine } from './audio/AudioEngine'
import { AudioSync } from './components/AudioSync'
import { CorridorScene } from './components/CorridorScene'
import { DecisionPanel } from './components/DecisionPanel'
import { ExperienceHUD } from './components/ExperienceHUD'
import { PhaseTicker } from './components/PhaseTicker'
import { useExperienceStore } from './store/experienceStore'
import './App.css'

export default function App() {
  const unlocked = useExperienceStore((s) => s.unlocked)
  const setUnlocked = useExperienceStore((s) => s.setUnlocked)
  const reset = useExperienceStore((s) => s.reset)

  const onUnlock = useCallback(async () => {
    await audioEngine.unlock()
    audioEngine.setProfile('p0')
    setUnlocked()
  }, [setUnlocked])

  return (
    <div className="app-root">
      {!unlocked && (
        <button type="button" className="unlock-screen" onClick={onUnlock}>
          <span className="unlock-label">Tap to enter</span>
        </button>
      )}

      {unlocked && (
        <>
          <PhaseTicker />
          <AudioSync />
          <Canvas
            className="canvas"
            camera={{ position: [0, 1.55, 10.2], fov: 52, near: 0.1, far: 80 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            dpr={[1, 2]}
          >
            <Suspense fallback={null}>
              <CorridorScene />
            </Suspense>
          </Canvas>
          <ExperienceHUD />
          <DecisionPanel />
        </>
      )}

      <div className="chrome-bar">
        <button type="button" className="chrome-muted" onClick={() => reset()} disabled={!unlocked}>
          Restart experience
        </button>
      </div>
    </div>
  )
}
