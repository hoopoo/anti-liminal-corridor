/**
 * Procedural layers — bed / HVAC / distant / murmur / life (P3 subtle habitation).
 * No speech, no intelligible conversation.
 */

import type { DecisionChoice } from '../store/experienceStore'

export type AudioProfile =
  | 'p0'
  | 'p1'
  | 'p2'
  | 'deciding'
  | 'approach'
  | 'ignore'
  | 'leave'

function makeBrownNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) * 0.993
    data[i] = last
  }
  return buffer
}

function isP3Profile(p: AudioProfile): p is 'approach' | 'ignore' | 'leave' {
  return p === 'approach' || p === 'ignore' || p === 'leave'
}

/** 全体 ~+15% — 「気のせいじゃないかも」側へ */
const MASTER_UNMUTED = 0.6

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null

  private bed: GainNode | null = null
  private bedSource: AudioBufferSourceNode | null = null

  private hvac: OscillatorNode | null = null
  private hvacGain: GainNode | null = null

  private distant: GainNode | null = null
  private distantFilter: BiquadFilterNode | null = null
  private distantNoiseSource: AudioBufferSourceNode | null = null

  private door: GainNode | null = null
  private doorNoiseSource: AudioBufferSourceNode | null = null

  private murmur: GainNode | null = null
  private murmurFilter: BiquadFilterNode | null = null
  private murmurNoiseSource: AudioBufferSourceNode | null = null

  private lifeMetal: GainNode | null = null
  private lifeMetalNoise: AudioBufferSourceNode | null = null
  private lifeMetalFilter: BiquadFilterNode | null = null
  private lifeAir: GainNode | null = null
  private lifeAirNoise: AudioBufferSourceNode | null = null
  private lifeAirFilter: BiquadFilterNode | null = null
  private lifeSub: GainNode | null = null
  private lifeSubOsc: OscillatorNode | null = null
  private lifeSubLfo: OscillatorNode | null = null
  private lifeSubLfoDepth: GainNode | null = null

  private distantPan: StereoPannerNode | null = null
  private stereoWobble: OscillatorNode | null = null
  private stereoWobbleAmp: GainNode | null = null

  private profile: AudioProfile = 'p0'
  /** While profile === deciding: pointer preview */
  private hoverHint: DecisionChoice | null = null
  private distantInterval: ReturnType<typeof setInterval> | null = null
  private lifeAirInterval: ReturnType<typeof setInterval> | null = null
  private lifeMetalInterval: ReturnType<typeof setInterval> | null = null

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    if (!this.master) {
      this.buildGraph()
    }
    this.setProfile(this.profile)
  }

  private buildGraph() {
    const ctx = this.ctx!
    this.master = ctx.createGain()
    this.master.gain.value = MASTER_UNMUTED

    this.bed = ctx.createGain()
    this.bed.gain.value = 0.0001

    const noiseBuf = makeBrownNoiseBuffer(ctx, 3)
    this.bedSource = ctx.createBufferSource()
    this.bedSource.buffer = noiseBuf
    this.bedSource.loop = true
    const bedFilter = ctx.createBiquadFilter()
    bedFilter.type = 'lowpass'
    bedFilter.frequency.value = 312
    const bedShelf = ctx.createBiquadFilter()
    bedShelf.type = 'lowshelf'
    bedShelf.frequency.value = 170
    bedShelf.gain.value = 3.2
    this.bedSource.connect(bedFilter)
    bedFilter.connect(bedShelf)
    bedShelf.connect(this.bed)

    this.hvacGain = ctx.createGain()
    this.hvacGain.gain.value = 0
    this.hvac = ctx.createOscillator()
    this.hvac.type = 'sine'
    this.hvac.frequency.value = 52
    this.hvac.connect(this.hvacGain)

    this.distantFilter = ctx.createBiquadFilter()
    this.distantFilter.type = 'bandpass'
    this.distantFilter.frequency.value = 900
    this.distantFilter.Q.value = 0.7
    this.distant = ctx.createGain()
    this.distant.gain.value = 0
    this.distantNoiseSource = ctx.createBufferSource()
    this.distantNoiseSource.buffer = makeBrownNoiseBuffer(ctx, 1.5)
    this.distantNoiseSource.loop = true
    this.distantNoiseSource.connect(this.distantFilter)
    this.distantFilter.connect(this.distant)

    this.distantPan = ctx.createStereoPanner()
    this.distantPan.pan.value = 0
    this.stereoWobble = ctx.createOscillator()
    this.stereoWobble.type = 'sine'
    this.stereoWobble.frequency.value = 0.034
    this.stereoWobbleAmp = ctx.createGain()
    this.stereoWobbleAmp.gain.value = 0.16
    this.stereoWobble.connect(this.stereoWobbleAmp)
    this.stereoWobbleAmp.connect(this.distantPan.pan)
    this.distant.connect(this.distantPan)

    this.door = ctx.createGain()
    this.door.gain.value = 0
    this.doorNoiseSource = ctx.createBufferSource()
    this.doorNoiseSource.buffer = makeBrownNoiseBuffer(ctx, 0.8)
    this.doorNoiseSource.loop = true
    const doorFilter = ctx.createBiquadFilter()
    doorFilter.type = 'lowpass'
    doorFilter.frequency.value = 700
    this.doorNoiseSource.connect(doorFilter)
    doorFilter.connect(this.door)

    this.murmurFilter = ctx.createBiquadFilter()
    this.murmurFilter.type = 'bandpass'
    this.murmurFilter.frequency.value = 420
    this.murmurFilter.Q.value = 1.2
    this.murmur = ctx.createGain()
    this.murmur.gain.value = 0
    this.murmurNoiseSource = ctx.createBufferSource()
    this.murmurNoiseSource.buffer = makeBrownNoiseBuffer(ctx, 1.2)
    this.murmurNoiseSource.loop = true
    this.murmurNoiseSource.connect(this.murmurFilter)
    this.murmurFilter.connect(this.murmur)

    this.lifeMetalFilter = ctx.createBiquadFilter()
    this.lifeMetalFilter.type = 'highpass'
    this.lifeMetalFilter.frequency.value = 2200
    this.lifeMetal = ctx.createGain()
    this.lifeMetal.gain.value = 0
    this.lifeMetalNoise = ctx.createBufferSource()
    this.lifeMetalNoise.buffer = makeBrownNoiseBuffer(ctx, 0.5)
    this.lifeMetalNoise.loop = true
    this.lifeMetalNoise.connect(this.lifeMetalFilter)
    this.lifeMetalFilter.connect(this.lifeMetal)

    this.lifeAirFilter = ctx.createBiquadFilter()
    this.lifeAirFilter.type = 'bandpass'
    this.lifeAirFilter.frequency.value = 1400
    this.lifeAirFilter.Q.value = 0.35
    this.lifeAir = ctx.createGain()
    this.lifeAir.gain.value = 0
    this.lifeAirNoise = ctx.createBufferSource()
    this.lifeAirNoise.buffer = makeBrownNoiseBuffer(ctx, 2)
    this.lifeAirNoise.loop = true
    this.lifeAirNoise.connect(this.lifeAirFilter)
    this.lifeAirFilter.connect(this.lifeAir)

    this.lifeSub = ctx.createGain()
    this.lifeSub.gain.value = 0
    this.lifeSubOsc = ctx.createOscillator()
    this.lifeSubOsc.type = 'sine'
    this.lifeSubOsc.frequency.value = 46
    this.lifeSubLfo = ctx.createOscillator()
    this.lifeSubLfo.type = 'sine'
    this.lifeSubLfo.frequency.value = 0.09
    this.lifeSubLfoDepth = ctx.createGain()
    this.lifeSubLfoDepth.gain.value = 1.8
    this.lifeSubLfo.connect(this.lifeSubLfoDepth)
    this.lifeSubLfoDepth.connect(this.lifeSubOsc.frequency)
    this.lifeSubOsc.connect(this.lifeSub)

    this.bed.connect(this.master)
    this.hvacGain.connect(this.master)
    this.distantPan!.connect(this.master)
    this.door.connect(this.master)
    this.murmur.connect(this.master)
    this.lifeMetal.connect(this.master)
    this.lifeAir.connect(this.master)
    this.lifeSub.connect(this.master)
    this.master.connect(ctx.destination)

    this.bedSource.start()
    this.distantNoiseSource.start()
    this.doorNoiseSource.start()
    this.murmurNoiseSource.start()
    this.lifeMetalNoise.start()
    this.lifeAirNoise.start()
    this.lifeSubOsc.start(0)
    this.lifeSubLfo.start(0)
    this.stereoWobble.start(0)
    this.hvac.start(0)
  }

  setProfile(next: AudioProfile) {
    this.profile = next
    if (next !== 'deciding') {
      this.hoverHint = null
    }
    const ctx = this.ctx
    if (
      !ctx ||
      !this.master ||
      !this.bed ||
      !this.hvacGain ||
      !this.distant ||
      !this.distantPan ||
      !this.door ||
      !this.murmur ||
      !this.murmurFilter ||
      !this.distantFilter ||
      !this.lifeMetal ||
      !this.lifeAir ||
      !this.lifeSub ||
      !this.lifeAirFilter
    ) {
      return
    }

    const t = ctx.currentTime
    const ramp = 0.8

    const clearIntervals = () => {
      if (this.distantInterval) {
        clearInterval(this.distantInterval)
        this.distantInterval = null
      }
      if (this.lifeAirInterval) {
        clearInterval(this.lifeAirInterval)
        this.lifeAirInterval = null
      }
      if (this.lifeMetalInterval) {
        clearInterval(this.lifeMetalInterval)
        this.lifeMetalInterval = null
      }
    }
    clearIntervals()

    const smooth = (g: GainNode, v: number, delay = 0) => {
      g.gain.cancelScheduledValues(t)
      const cur = Math.max(g.gain.value, 0.0001)
      g.gain.setValueAtTime(cur, t)
      g.gain.linearRampToValueAtTime(Math.max(v, 0), t + ramp + delay)
    }

    this.distantFilter.Q.cancelScheduledValues(t)
    this.distantFilter.Q.setValueAtTime(0.7, t)
    this.murmurFilter.frequency.cancelScheduledValues(t)
    this.murmurFilter.frequency.setValueAtTime(420, t)
    this.lifeAirFilter.frequency.cancelScheduledValues(t)
    this.lifeAirFilter.frequency.setValueAtTime(1400, t)

    smooth(this.bed, 0.02)
    smooth(this.hvacGain, 0)
    smooth(this.distant, 0)
    smooth(this.door, 0)
    smooth(this.murmur, 0)
    smooth(this.lifeMetal, 0)
    smooth(this.lifeAir, 0)
    smooth(this.lifeSub, 0)

    switch (next) {
      case 'p0':
        smooth(this.bed, 0.035)
        break
      case 'p1':
        smooth(this.bed, 0.06)
        smooth(this.hvacGain, 0.018)
        break
      case 'p2':
        smooth(this.bed, 0.076)
        smooth(this.hvacGain, 0.024)
        smooth(this.distant, 0.045)
        this.distantInterval = setInterval(() => {
          if (!this.ctx || !this.distant) return
          const now = this.ctx.currentTime
          this.distant.gain.cancelScheduledValues(now)
          const gv = Math.max(this.distant.gain.value, 0.0001)
          this.distant.gain.setValueAtTime(gv, now)
          this.distant.gain.linearRampToValueAtTime(0.12, now + 0.05)
          this.distant.gain.linearRampToValueAtTime(0.03, now + 0.45)
        }, 5200)
        this.pulseDoor(1)
        break
      case 'deciding':
        smooth(this.bed, 0.086)
        smooth(this.hvacGain, 0.027)
        smooth(this.distant, 0.067)
        break
      case 'approach':
        smooth(this.bed, 0.088)
        smooth(this.hvacGain, 0.028)
        smooth(this.distant, 0.056)
        smooth(this.murmur, 0.042)
        this.murmurFilter.frequency.linearRampToValueAtTime(310, t + 2.4)
        this.activateLife('approach')
        break
      case 'ignore':
        smooth(this.bed, 0.112)
        smooth(this.hvacGain, 0.026)
        smooth(this.distant, 0.046)
        this.distantFilter.frequency.linearRampToValueAtTime(820, t + 1.2)
        this.distantFilter.Q.linearRampToValueAtTime(2.45, t + 1.4)
        this.activateLife('ignore')
        break
      case 'leave':
        smooth(this.bed, 0.038)
        smooth(this.hvacGain, 0.007)
        smooth(this.distant, 0.012)
        smooth(this.murmur, 0.005)
        this.distantFilter.frequency.linearRampToValueAtTime(540, t + 1.8)
        this.activateLife('leave')
        break
    }

    if (next === 'deciding') {
      this.applyDecidingHover(this.hoverHint)
    }
  }

  /**
   * Pre-commit spatial listening: “sound moves” before click.
   * Only effective while profile === deciding.
   */
  setHoverHint(h: DecisionChoice | null) {
    this.hoverHint = h
    if (this.profile === 'deciding') {
      this.applyDecidingHover(h)
    }
  }

  private applyDecidingHover(h: DecisionChoice | null) {
    const ctx = this.ctx
    if (!ctx || !this.distant || !this.distantFilter || !this.murmur || !this.bed) return

    const t = ctx.currentTime
    const baseD = 0.067
    const baseF = 900
    const baseM = 0
    const baseBed = 0.086

    let d = baseD
    let f = baseF
    let m = baseM
    let bed = baseBed
    let q = 0.72

    if (h === 'approach') {
      d = baseD + 0.022
      f = baseF + 115
      m = baseM + 0.012
      bed = baseBed + 0.007
    } else if (h === 'leave') {
      d = Math.max(baseD - 0.019, 0.026)
      f = baseF - 130
      m = baseM
      bed = Math.max(baseBed - 0.009, 0.066)
    } else if (h === 'ignore') {
      d = baseD + 0.012
      f = baseF + 42
      m = baseM + 0.007
      q = 0.86
    }

    this.distant.gain.cancelScheduledValues(t)
    this.distant.gain.setValueAtTime(Math.max(this.distant.gain.value, 0.0001), t)
    this.distant.gain.linearRampToValueAtTime(d, t + 0.35)

    this.distantFilter.frequency.cancelScheduledValues(t)
    this.distantFilter.frequency.setValueAtTime(this.distantFilter.frequency.value, t)
    this.distantFilter.frequency.linearRampToValueAtTime(f, t + 0.4)

    this.distantFilter.Q.cancelScheduledValues(t)
    this.distantFilter.Q.setValueAtTime(this.distantFilter.Q.value, t)
    this.distantFilter.Q.linearRampToValueAtTime(q, t + 0.35)

    this.murmur.gain.cancelScheduledValues(t)
    this.murmur.gain.setValueAtTime(Math.max(this.murmur.gain.value, 0), t)
    this.murmur.gain.linearRampToValueAtTime(m, t + 0.45)

    this.bed.gain.cancelScheduledValues(t)
    this.bed.gain.setValueAtTime(Math.max(this.bed.gain.value, 0.0001), t)
    this.bed.gain.linearRampToValueAtTime(bed, t + 0.5)
  }

  /**
   * Stage 1 after choice: 音だけ（life / 確定プロファイルはまだ載せない）
   */
  applyBranchAudioOnly(choice: DecisionChoice) {
    this.playResolveDistantCue(choice)
    const ctx = this.ctx
    if (!ctx || !this.bed || !this.hvacGain || !this.distant || !this.murmur || !this.murmurFilter || !this.distantFilter) {
      return
    }
    const t = ctx.currentTime
    const ramp = 1.15

    const smooth = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t)
      const cur = Math.max(g.gain.value, 0.0001)
      g.gain.setValueAtTime(cur, t)
      g.gain.linearRampToValueAtTime(Math.max(v, 0), t + ramp)
    }

    switch (choice) {
      case 'approach':
        smooth(this.bed, 0.095)
        smooth(this.hvacGain, 0.029)
        smooth(this.distant, 0.076)
        smooth(this.murmur, 0.022)
        this.murmurFilter.frequency.linearRampToValueAtTime(360, t + 1.6)
        this.distantFilter.frequency.linearRampToValueAtTime(1020, t + 1.2)
        break
      case 'ignore':
        smooth(this.bed, 0.11)
        smooth(this.hvacGain, 0.028)
        smooth(this.distant, 0.058)
        smooth(this.murmur, 0.011)
        this.distantFilter.Q.linearRampToValueAtTime(1.45, t + 1)
        this.distantFilter.frequency.linearRampToValueAtTime(860, t + 1)
        break
      case 'leave':
        smooth(this.bed, 0.062)
        smooth(this.hvacGain, 0.018)
        smooth(this.distant, 0.033)
        smooth(this.murmur, 0)
        this.distantFilter.frequency.linearRampToValueAtTime(680, t + 1.4)
        break
    }
  }

  /** Transient distant / hatch — 単体でも使える */
  playResolveDistantCue(choice: DecisionChoice) {
    const ctx = this.ctx
    if (!ctx || !this.distant || !this.distantFilter || !this.door) return

    const now = ctx.currentTime
    const fT =
      choice === 'approach' ? 1080 : choice === 'leave' ? 620 : 900

    this.distant.gain.cancelScheduledValues(now)
    const g0 = Math.max(this.distant.gain.value, 0.0001)
    this.distant.gain.setValueAtTime(g0, now)
    this.distant.gain.linearRampToValueAtTime(0.148, now + 0.07)
    this.distant.gain.linearRampToValueAtTime(0.06, now + 1.1)

    this.distantFilter.frequency.cancelScheduledValues(now)
    this.distantFilter.frequency.setValueAtTime(this.distantFilter.frequency.value, now)
    this.distantFilter.frequency.linearRampToValueAtTime(fT, now + 0.09)
    this.distantFilter.frequency.linearRampToValueAtTime(900, now + 1.4)

    this.door.gain.cancelScheduledValues(now)
    this.door.gain.setValueAtTime(0.0001, now)
    const dk = choice === 'leave' ? 0.068 : choice === 'ignore' ? 0.09 : 0.095
    this.door.gain.linearRampToValueAtTime(dk, now + 0.025)
    this.door.gain.linearRampToValueAtTime(0.0001, now + 0.36)
  }

  /** Ultra-subtle habitation layer — metal stress, air mass, sub swell */
  private activateLife(branch: 'approach' | 'ignore' | 'leave') {
    const ctx = this.ctx
    if (!ctx || !this.lifeMetal || !this.lifeAir || !this.lifeSub || !this.lifeAirFilter) return

    const t = ctx.currentTime
    const airBase = branch === 'approach' ? 0.042 : branch === 'ignore' ? 0.054 : 0.014
    const subBase = branch === 'approach' ? 0.013 : branch === 'ignore' ? 0.01 : 0.0035

    this.lifeAir.gain.cancelScheduledValues(t)
    this.lifeAir.gain.setValueAtTime(0.0001, t)
    this.lifeAir.gain.linearRampToValueAtTime(airBase, t + 1.6)
    this.lifeSub.gain.cancelScheduledValues(t)
    this.lifeSub.gain.setValueAtTime(0.0001, t)
    this.lifeSub.gain.linearRampToValueAtTime(subBase, t + 2.2)

    this.lifeAirInterval = setInterval(() => {
      if (!this.ctx || !this.lifeAirFilter) return
      if (!isP3Profile(this.profile)) return
      const now = this.ctx.currentTime
      const spread = branch === 'ignore' ? 950 : 450
      const f = 1200 + Math.sin(performance.now() * 0.00055) * spread
      this.lifeAirFilter.frequency.cancelScheduledValues(now)
      this.lifeAirFilter.frequency.setValueAtTime(this.lifeAirFilter.frequency.value, now)
      this.lifeAirFilter.frequency.linearRampToValueAtTime(f, now + 0.3)
    }, 280)

    const ping = () => {
      if (!this.ctx || !this.lifeMetal) return
      if (!isP3Profile(this.profile)) return
      const now = this.ctx.currentTime
      const bump = branch === 'leave' ? 0.032 : branch === 'ignore' ? 0.05 : 0.038
      this.lifeMetal.gain.cancelScheduledValues(now)
      this.lifeMetal.gain.setValueAtTime(0.0001, now)
      this.lifeMetal.gain.linearRampToValueAtTime(bump, now + 0.007)
      this.lifeMetal.gain.linearRampToValueAtTime(0.0001, now + 0.11 + Math.random() * 0.08)
    }

    this.lifeMetalInterval = setInterval(() => {
      if (Math.random() > 0.45) ping()
    }, 2200)
    ping()
  }

  private pulseDoor(times: number) {
    const ctx = this.ctx
    if (!ctx || !this.door) return
    let n = 0
    const fire = () => {
      if (n >= times) return
      n += 1
      const now = ctx.currentTime
      this.door!.gain.cancelScheduledValues(now)
      this.door!.gain.setValueAtTime(0, now)
      this.door!.gain.linearRampToValueAtTime(0.15, now + 0.04)
      this.door!.gain.linearRampToValueAtTime(0.001, now + 0.35)
    }
    fire()
  }

  setMuted(muted: boolean) {
    if (!this.master || !this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(this.master.gain.value, t)
    this.master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_UNMUTED, t + 0.15)
  }

  dispose() {
    if (this.distantInterval) clearInterval(this.distantInterval)
    if (this.lifeAirInterval) clearInterval(this.lifeAirInterval)
    if (this.lifeMetalInterval) clearInterval(this.lifeMetalInterval)
  }
}

export const audioEngine = new AudioEngine()
