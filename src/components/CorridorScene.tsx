import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecisionChoice, ResolveStage } from '../store/experienceStore'
import { useExperienceStore } from '../store/experienceStore'

const CORRIDOR_LENGTH = 48
const WIDTH = 3.2
const HEIGHT = 2.8

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

type Atm = {
  particleAlpha: number
  farPulse: number
  flickerStrength: number
  ambientBase: number
  fogDensity: number
  ambientWarmth: number
  localWarmTarget: number
  localIntensityTarget: number
}

function applyBranchAtmosphere(base: Atm, branch: DecisionChoice) {
  base.farPulse = 0.65
  base.ambientBase = branch === 'approach' ? 0.126 : branch === 'ignore' ? 0.105 : 0.086
  base.fogDensity = branch === 'approach' ? 0.064 : branch === 'ignore' ? 0.086 : 0.091
  base.particleAlpha = branch === 'leave' ? 0.19 : 0.4
  base.flickerStrength = branch === 'ignore' ? 0.058 : branch === 'approach' ? 0.026 : 0.019

  if (branch === 'approach') {
    base.ambientWarmth = 0.078
    base.localWarmTarget = 0.94
    base.localIntensityTarget = 1.09
  } else if (branch === 'ignore') {
    base.ambientWarmth = 0.028
    base.localWarmTarget = 0.23
    base.localIntensityTarget = 0.52
  } else {
    /** leave: 完全初期には戻さない — わずかな痕跡（やや拾いやすい底上げ） */
    base.ambientWarmth = 0.045
    base.localWarmTarget = 0.135
    base.localIntensityTarget = 0.32
    base.fogDensity = 0.089
    base.particleAlpha = 0.19
    base.farPulse = 0.44
  }
}

function corridorAtmosphere(
  phase: number,
  mode: string,
  decision: DecisionChoice | null,
  pendingDecision: DecisionChoice | null,
  resolveStage: ResolveStage,
  hover: DecisionChoice | null,
): Atm {
  const base: Atm = {
    particleAlpha: 0,
    farPulse: 0,
    flickerStrength: 0,
    ambientBase: 0.092,
    fogDensity: 0.065,
    ambientWarmth: 0,
    localWarmTarget: 0.082,
    localIntensityTarget: 0.27,
  }

  if (phase >= 1) {
    base.particleAlpha = 0.36
    base.flickerStrength = 0.038
    base.ambientBase = 0.103
    base.fogDensity = 0.076
    base.localWarmTarget = 0.115
    base.localIntensityTarget = 0.46
  }

  if (phase >= 2 && mode === 'observe') {
    base.farPulse = 1
    base.ambientBase = 0.114
    base.localIntensityTarget = 0.67
    base.localWarmTarget = 0.162
  }

  if (mode === 'deciding') {
    base.farPulse = 1
    base.flickerStrength = 0.048
    base.localIntensityTarget = 0.57
    base.localWarmTarget = 0.147
    base.fogDensity = 0.078
  }

  if (mode === 'resolving' && (resolveStage === 'wait' || resolveStage === 'audio')) {
    base.farPulse = 0.44
    base.flickerStrength = 0.017
    base.localIntensityTarget = 0.48
    base.localWarmTarget = 0.108
    base.fogDensity = 0.073
  }

  const branch: DecisionChoice | null =
    mode === 'resolved' && decision
      ? decision
      : mode === 'resolving' && resolveStage === 'light' && pendingDecision
        ? pendingDecision
        : null

  if (branch) {
    applyBranchAtmosphere(base, branch)
  }

  if (mode === 'deciding' && hover) {
    if (hover === 'approach') {
      base.localWarmTarget += 0.038
      base.localIntensityTarget += 0.048
      base.ambientWarmth += 0.018
    } else if (hover === 'leave') {
      base.localWarmTarget = Math.max(base.localWarmTarget - 0.028, 0.034)
      base.localIntensityTarget -= 0.038
      base.fogDensity += 0.007
      base.ambientWarmth = Math.max(base.ambientWarmth - 0.014, 0)
    } else if (hover === 'ignore') {
      base.localWarmTarget += 0.016
      base.flickerStrength += 0.011
    }
  }

  return base
}

export function CorridorScene() {
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const endRef = useRef<THREE.PointLight>(null)
  const spotRef = useRef<THREE.SpotLight>(null)
  const endMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const particlesRef = useRef<THREE.Points>(null)
  const fogTarget = useRef({ density: 0.072 })

  const smoothLocal = useRef({ warm: 0.06, intensity: 0.22 })

  const { scene } = useThree()

  const particlePositions = useMemo(() => {
    const count = 72
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * WIDTH * 0.9
      arr[i * 3 + 1] = Math.random() * HEIGHT * 0.85 + 0.1
      arr[i * 3 + 2] = -4 - Math.random() * (CORRIDOR_LENGTH - 8)
    }
    return arr
  }, [])

  useLayoutEffect(() => {
    const fog = new THREE.FogExp2(new THREE.Color('#d4dce6'), 0.072)
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { phase, mode, decision, pendingDecision, resolveStage, hoverPreview } =
      useExperienceStore.getState()
    const atm = corridorAtmosphere(
      phase,
      mode,
      decision,
      pendingDecision,
      resolveStage,
      hoverPreview,
    )

    fogTarget.current.density = lerp(fogTarget.current.density, atm.fogDensity, 0.03)

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = fogTarget.current.density
      const warm = smoothLocal.current.warm
      const fc = new THREE.Color().setHSL(0.6 - warm * 0.05, 0.04 + warm * 0.08, 0.78 - warm * 0.03)
      scene.fog.color.copy(fc)
    }

    smoothLocal.current.warm = lerp(smoothLocal.current.warm, atm.localWarmTarget, 0.024)
    smoothLocal.current.intensity = lerp(smoothLocal.current.intensity, atm.localIntensityTarget, 0.024)

    const flick =
      phase >= 1
        ? Math.sin(t * 2.8) * atm.flickerStrength + Math.sin(t * 6.3) * (atm.flickerStrength * 0.45)
        : 0

    if (ambientRef.current) {
      ambientRef.current.intensity = atm.ambientBase + flick
      const aw = atm.ambientWarmth
      ambientRef.current.color.setHSL(0.59 - aw * 0.04, 0.06 + aw * 0.1, 0.73 + aw * 0.05)
    }

    const pulse =
      atm.farPulse > 0
        ? (Math.sin(t * 1.1) * 0.5 + 0.5) * 0.4 + (Math.sin(t * 5.2) > 0.92 ? 0.35 : 0)
        : 0

    const lw = smoothLocal.current.warm
    const li = smoothLocal.current.intensity

    if (endRef.current) {
      const lx = 0.28 + Math.sin(t * 0.35) * 0.04
      endRef.current.position.set(lx, HEIGHT * 0.52, -CORRIDOR_LENGTH + 1.35)
      endRef.current.intensity = THREE.MathUtils.clamp(li * (0.45 + pulse * 0.35), 0.05, 1.6)
      endRef.current.color.setHSL(0.08 + lw * 0.1, 0.2 + lw * 0.45, 0.52 + lw * 0.22)
    }

    if (spotRef.current) {
      spotRef.current.intensity = 0.14 + pulse * 0.18 + lw * 0.06
      spotRef.current.position.x = Math.sin(t * 0.7) * 0.1
      spotRef.current.color.setHSL(0.56, 0.04, 0.92)
    }

    if (endMatRef.current) {
      endMatRef.current.emissiveIntensity = 0.12 + pulse * 0.75 + lw * 0.45
      endMatRef.current.emissive.setHSL(0.09 + lw * 0.14, 0.28 + lw * 0.25, 0.4 + lw * 0.2)
    }

    if (particlesRef.current) {
      const m = particlesRef.current.material as THREE.PointsMaterial
      m.opacity = lerp(m.opacity, atm.particleAlpha, 0.05)
      particlesRef.current.visible = phase >= 1
    }
  })

  const zCenter = -CORRIDOR_LENGTH / 2

  return (
    <group>
      <color attach="background" args={['#aeb8c4']} />
      <ambientLight ref={ambientRef} intensity={0.09} color="#c8d0dc" />
      <spotLight
        ref={spotRef}
        position={[0.2, HEIGHT - 0.05, 1.2]}
        angle={0.55}
        penumbra={0.85}
        intensity={0.18}
        color="#eef2f8"
        decay={2}
        distance={CORRIDOR_LENGTH}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, zCenter]}>
        <planeGeometry args={[WIDTH, CORRIDOR_LENGTH]} />
        <meshStandardMaterial color="#9aa3ae" roughness={0.92} metalness={0.05} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, HEIGHT, zCenter]}>
        <planeGeometry args={[WIDTH, CORRIDOR_LENGTH]} />
        <meshStandardMaterial color="#8b93a0" roughness={0.95} metalness={0.04} />
      </mesh>

      <mesh position={[-WIDTH / 2, HEIGHT / 2, zCenter]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR_LENGTH, HEIGHT]} />
        <meshStandardMaterial color="#a7b0bb" roughness={0.9} metalness={0.06} />
      </mesh>

      <mesh position={[WIDTH / 2, HEIGHT / 2, zCenter]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR_LENGTH, HEIGHT]} />
        <meshStandardMaterial color="#a7b0bb" roughness={0.9} metalness={0.06} />
      </mesh>

      <mesh position={[0, HEIGHT / 2, -CORRIDOR_LENGTH + 0.05]}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshStandardMaterial
          ref={endMatRef}
          color="#6a7380"
          emissive="#334155"
          emissiveIntensity={0.2}
          roughness={0.88}
          metalness={0.08}
        />
      </mesh>

      <pointLight
        ref={endRef}
        position={[0.28, HEIGHT * 0.52, -CORRIDOR_LENGTH + 1.35]}
        distance={26}
        decay={2}
        intensity={0.25}
        color="#dfe6f2"
      />

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.028}
          color="#d8dee8"
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  )
}
