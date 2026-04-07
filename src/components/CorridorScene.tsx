import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecisionChoice, ResolveStage } from '../store/experienceStore'
import { useExperienceStore } from '../store/experienceStore'

const CORRIDOR_LENGTH = 48
const WIDTH = 3.2
const HEIGHT = 2.8
/** 粒子の奥行ループ範囲（カメラ側 Z_HI ＝手前 → 奥 Z_LO） */
const DUST_Z_HI = -1.15
const DUST_Z_LO = -CORRIDOR_LENGTH + 1.6
const DUST_Z_SPAN = DUST_Z_HI - DUST_Z_LO
const PHI = 0.618033988749895

function wrapDustZ(z: number): number {
  let v = z
  while (v < DUST_Z_LO) v += DUST_Z_SPAN
  while (v > DUST_Z_HI) v -= DUST_Z_SPAN
  return v
}

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

/** FogExp2 は density²×depth² で効くため、数値は小さめ（0.02 前後）でコリドーが読める */
function applyBranchAtmosphere(base: Atm, branch: DecisionChoice) {
  base.farPulse = 0.72
  base.ambientBase = branch === 'approach' ? 0.142 : branch === 'ignore' ? 0.098 : 0.092
  base.fogDensity = branch === 'approach' ? 0.018 : branch === 'ignore' ? 0.032 : 0.034
  base.particleAlpha = branch === 'leave' ? 0.28 : 0.5
  base.flickerStrength = branch === 'ignore' ? 0.072 : branch === 'approach' ? 0.032 : 0.024

  if (branch === 'approach') {
    base.ambientWarmth = 0.095
    base.localWarmTarget = 1.0
    base.localIntensityTarget = 1.26
  } else if (branch === 'ignore') {
    base.ambientWarmth = 0.022
    base.localWarmTarget = 0.17
    base.localIntensityTarget = 0.42
  } else {
    /** leave: 完全初期には戻さない — わずかな痕跡（やや拾いやすい底上げ） */
    base.ambientWarmth = 0.055
    base.localWarmTarget = 0.19
    base.localIntensityTarget = 0.46
    base.fogDensity = 0.036
    base.particleAlpha = 0.28
    base.farPulse = 0.52
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
    /** P0 から粒子はごく薄く（非表示期間をなくす） */
    particleAlpha: 0.2,
    farPulse: 0,
    flickerStrength: 0.018,
    ambientBase: 0.11,
    fogDensity: 0.022,
    ambientWarmth: 0,
    localWarmTarget: 0.1,
    localIntensityTarget: 0.42,
  }

  if (phase >= 1) {
    base.particleAlpha = 0.48
    base.flickerStrength = 0.052
    base.ambientBase = 0.118
    base.fogDensity = 0.028
    base.localWarmTarget = 0.15
    base.localIntensityTarget = 0.58
  }

  if (phase >= 2 && mode === 'observe') {
    base.farPulse = 1
    base.ambientBase = 0.132
    base.localIntensityTarget = 0.82
    base.localWarmTarget = 0.2
    base.fogDensity = 0.03
  }

  if (mode === 'deciding') {
    base.farPulse = 1
    base.flickerStrength = 0.064
    base.localIntensityTarget = 0.72
    base.localWarmTarget = 0.18
    base.fogDensity = 0.032
  }

  if (mode === 'resolving' && (resolveStage === 'wait' || resolveStage === 'audio')) {
    base.farPulse = 0.52
    base.flickerStrength = 0.024
    base.localIntensityTarget = 0.58
    base.localWarmTarget = 0.125
    base.fogDensity = 0.028
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
      base.localWarmTarget += 0.055
      base.localIntensityTarget += 0.072
      base.ambientWarmth += 0.026
    } else if (hover === 'leave') {
      base.localWarmTarget = Math.max(base.localWarmTarget - 0.04, 0.03)
      base.localIntensityTarget -= 0.055
      base.fogDensity += 0.012
      base.ambientWarmth = Math.max(base.ambientWarmth - 0.02, 0)
    } else if (hover === 'ignore') {
      base.localWarmTarget += 0.024
      base.flickerStrength += 0.016
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
  const fogTarget = useRef({ density: 0.022 })

  const smoothLocal = useRef({ warm: 0.08, intensity: 0.32 })

  const { scene } = useThree()

  /** 基底座標：φ で間引いた分布 — 完全一様乱数より「流れ」と相性がよい */
  const particleBase = useMemo(() => {
    const count = 96
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const s = (i * PHI) % 1
      const u = (i * PHI * PHI) % 1
      arr[i * 3] = (s - 0.5) * WIDTH * 0.92
      arr[i * 3 + 1] = u * HEIGHT * 0.88 + 0.08
      const depthMix = s * 0.55 + (i / count) * 0.45
      arr[i * 3 + 2] = DUST_Z_HI - depthMix * (DUST_Z_HI - DUST_Z_LO)
    }
    return arr
  }, [])

  useLayoutEffect(() => {
    const fog = new THREE.FogExp2(new THREE.Color('#c8d4e2'), 0.022)
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

    fogTarget.current.density = lerp(fogTarget.current.density, atm.fogDensity, 0.042)

    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = fogTarget.current.density
      const warm = smoothLocal.current.warm
      const fc = new THREE.Color().setHSL(0.6 - warm * 0.05, 0.04 + warm * 0.08, 0.78 - warm * 0.03)
      scene.fog.color.copy(fc)
    }

    smoothLocal.current.warm = lerp(smoothLocal.current.warm, atm.localWarmTarget, 0.038)
    smoothLocal.current.intensity = lerp(smoothLocal.current.intensity, atm.localIntensityTarget, 0.038)

    const flick =
      Math.sin(t * 2.8) * atm.flickerStrength + Math.sin(t * 6.3) * (atm.flickerStrength * 0.45)

    /** 空間の呼吸 — 指定どおりの周波数・振幅、環境光には弱めにのみ乗せる */
    const breath = Math.sin(t * 0.2) * 0.01

    if (ambientRef.current) {
      ambientRef.current.intensity = atm.ambientBase + flick + breath * 0.32
      const aw = atm.ambientWarmth
      ambientRef.current.color.setHSL(0.59 - aw * 0.05, 0.06 + aw * 0.14, 0.7 + aw * 0.08)
    }

    const pulse =
      atm.farPulse > 0
        ? (Math.sin(t * 1.1) * 0.5 + 0.5) * 0.52 + (Math.sin(t * 5.2) > 0.92 ? 0.42 : 0)
        : 0

    const lw = smoothLocal.current.warm
    const li = smoothLocal.current.intensity

    if (endRef.current) {
      const lx = 0.28 + Math.sin(t * 0.35) * 0.04
      endRef.current.position.set(lx, HEIGHT * 0.52, -CORRIDOR_LENGTH + 1.35)
      endRef.current.intensity = THREE.MathUtils.clamp(
        li * (0.48 + pulse * 0.45) + breath,
        0.06,
        1.9,
      )
      endRef.current.color.setHSL(0.08 + lw * 0.1, 0.2 + lw * 0.45, 0.52 + lw * 0.22)
    }

    if (spotRef.current) {
      spotRef.current.intensity = 0.17 + pulse * 0.24 + lw * 0.085 + breath * 0.55
      spotRef.current.position.x = Math.sin(t * 0.7) * 0.1
      spotRef.current.color.setHSL(0.56, 0.04, 0.92)
    }

    if (endMatRef.current) {
      endMatRef.current.emissiveIntensity = 0.14 + pulse * 0.92 + lw * 0.52 + breath * 0.42
      endMatRef.current.emissive.setHSL(0.09 + lw * 0.14, 0.28 + lw * 0.25, 0.4 + lw * 0.2)
    }

    if (particlesRef.current) {
      const m = particlesRef.current.material as THREE.PointsMaterial
      m.opacity = lerp(m.opacity, atm.particleAlpha, 0.085)
      particlesRef.current.visible = true
      /** 頂点で奥行き流れを出すため、グループの大きな揺れは止める */
      particlesRef.current.rotation.y = 0
      particlesRef.current.position.y = 0
    }

    /** Points の geometry は ref より particles.geometry が確実（R3F の子 ref は取りこぼすことがある） */
    const dustGeom = particlesRef.current?.geometry
    const posAttr = dustGeom?.attributes.position
    if (posAttr && particlesRef.current) {
      const out = posAttr.array as Float32Array
      const n = particleBase.length / 3
      for (let i = 0; i < n; i++) {
        const bx = particleBase[i * 3]
        const by = particleBase[i * 3 + 1]
        const bz = particleBase[i * 3 + 2]
        const seed = (i * PHI) % 1
        const phase = seed * Math.PI * 2
        /** 奥（-Z）へゆっくり流す＋位相の違いでランダムっぽさを崩す */
        const backFlow = t * (0.0105 + seed * 0.0065)
        const z = wrapDustZ(bz - backFlow)
        const sx =
          Math.sin(t * 0.118 + phase) * 0.013 + Math.sin(t * 0.046 + phase * 1.31) * 0.0055
        const sy = Math.cos(t * 0.092 + phase * 0.84) * 0.01
        out[i * 3] = bx + sx
        out[i * 3 + 1] = by + sy
        out[i * 3 + 2] = z
      }
      posAttr.needsUpdate = true
      /** 頂点更新後は BS を更新しないと全体がフラストラム外扱いで消えることがある */
      dustGeom.boundingSphere = null
      dustGeom.computeBoundingSphere()
    }
  })

  const zCenter = -CORRIDOR_LENGTH / 2

  return (
    <group>
      <color attach="background" args={['#b8c2d0']} />
      <ambientLight ref={ambientRef} intensity={0.09} color="#c8d0dc" />
      <hemisphereLight intensity={0.35} color="#e8edf5" groundColor="#5a6270" position={[0, HEIGHT, 0]} />
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
        <meshStandardMaterial color="#aeb6c4" roughness={0.9} metalness={0.05} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, HEIGHT, zCenter]}>
        <planeGeometry args={[WIDTH, CORRIDOR_LENGTH]} />
        <meshStandardMaterial color="#9ca6b4" roughness={0.93} metalness={0.04} />
      </mesh>

      <mesh position={[-WIDTH / 2, HEIGHT / 2, zCenter]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR_LENGTH, HEIGHT]} />
        <meshStandardMaterial color="#b8c2ce" roughness={0.88} metalness={0.06} />
      </mesh>

      <mesh position={[WIDTH / 2, HEIGHT / 2, zCenter]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[CORRIDOR_LENGTH, HEIGHT]} />
        <meshStandardMaterial color="#b8c2ce" roughness={0.88} metalness={0.06} />
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

      <points ref={particlesRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particleBase, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.044}
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
