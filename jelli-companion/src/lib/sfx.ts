import { audioPlayer } from './audio'
import { useConfigStore } from '@/stores/config'

export type SoundName = 'click' | 'sleep' | 'wake' | 'happy' | 'dizzy' | 'mad'

const SOUND_FILES: Record<SoundName, string> = {
  click: '/sounds/click.wav',
  sleep: '/sounds/sleep.wav',
  wake: '/sounds/wake.wav',
  happy: '/sounds/happy.wav',
  dizzy: '/sounds/dizzy.wav',
  mad: '/sounds/mad.wav',
}

const DEBOUNCE_MS = 500

let audioCtx: AudioContext | null = null
let sfxGain: GainNode | null = null
const buffers = new Map<SoundName, AudioBuffer>()
const lastPlayed = new Map<SoundName, number>()

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: 44100 })
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function getGain(): GainNode {
  if (!sfxGain) {
    const ctx = getCtx()
    sfxGain = ctx.createGain()
    sfxGain.connect(ctx.destination)
  }
  return sfxGain
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes.buffer
}

function generatePlaceholder(name: SoundName): Float32Array {
  const sr = 44100
  let samples: Float32Array

  switch (name) {
    case 'click': {
      // Short bubble pop — ascending chirp
      const dur = 0.15
      const len = Math.floor(sr * dur)
      samples = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const env = 1 - t / dur
        const freq = 800 + 600 * (t / dur)
        samples[i] = env * 0.4 * Math.sin(2 * Math.PI * freq * t)
      }
      break
    }
    case 'sleep': {
      // Gentle descending chime
      const dur = 1.2
      const len = Math.floor(sr * dur)
      samples = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const env = Math.max(0, 1 - t / dur) * Math.max(0, 1 - t / dur)
        const freq = 600 - 300 * (t / dur)
        samples[i] = env * 0.3 * Math.sin(2 * Math.PI * freq * t)
      }
      break
    }
    case 'wake': {
      // Bright ascending chime
      const dur = 0.6
      const len = Math.floor(sr * dur)
      samples = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const env = Math.min(1, t / 0.05) * Math.max(0, 1 - t / dur)
        const freq = 400 + 800 * (t / dur)
        samples[i] = env * 0.35 * Math.sin(2 * Math.PI * freq * t)
      }
      break
    }
    case 'happy': {
      // Cheerful sparkle — two quick ascending notes
      const dur = 0.8
      const len = Math.floor(sr * dur)
      samples = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const note = t < 0.2 ? 0 : 1
        const freq = note === 0 ? 523 : 659 // C5, E5
        const localT = note === 0 ? t : t - 0.3
        const env = Math.max(0, 1 - Math.abs(localT - 0.15) / 0.2)
        samples[i] = env * 0.35 * Math.sin(2 * Math.PI * freq * localT)
      }
      break
    }
    case 'dizzy': {
      // Wobbly warble — LFO modulated
      const dur = 0.7
      const len = Math.floor(sr * dur)
      samples = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const env = Math.max(0, 1 - t / dur)
        const lfo = Math.sin(2 * Math.PI * 6 * t)
        const freq = 300 + 100 * lfo
        samples[i] = env * 0.3 * Math.sin(2 * Math.PI * freq * t)
      }
      break
    }
    case 'mad': {
      // Grumpy puff — low descending buzz
      const dur = 0.5
      const len = Math.floor(sr * dur)
      samples = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const env = Math.max(0, 1 - t / dur)
        const freq = 200 - 80 * (t / dur)
        // Square-ish wave for grumpy feel
        const wave = Math.sin(2 * Math.PI * freq * t) > 0 ? 0.3 : -0.3
        samples[i] = env * wave
      }
      break
    }
    default: {
      samples = new Float32Array(1)
    }
  }

  return samples
}

async function loadWav(url: string): Promise<AudioBuffer | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.arrayBuffer()
    const ctx = getCtx()
    return await ctx.decodeAudioData(data)
  } catch {
    return null
  }
}

export async function loadSounds(): Promise<void> {
  const ctx = getCtx()
  const entries = Object.entries(SOUND_FILES) as [SoundName, string][]

  for (const [name, url] of entries) {
    const buf = await loadWav(url)
    if (buf) {
      buffers.set(name, buf)
    } else {
      // Generate procedural placeholder
      const samples = generatePlaceholder(name)
      const audioBuf = ctx.createBuffer(1, samples.length, 44100)
      audioBuf.getChannelData(0).set(samples)
      buffers.set(name, audioBuf)
    }
  }
}

export function play(soundName: SoundName): void {
  const config = useConfigStore.getState()
  if (config.sfxMuted) return

  // Debounce: don't play same sound twice within 500ms
  const now = performance.now()
  const last = lastPlayed.get(soundName) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastPlayed.set(soundName, now)

  // Stop TTS if playing
  audioPlayer.stop()

  const buf = buffers.get(soundName)
  if (!buf) return

  const ctx = getCtx()
  const gain = getGain()
  gain.gain.value = config.sfxVolume

  const source = ctx.createBufferSource()
  source.buffer = buf
  source.connect(gain)
  source.start()
}

export function setSfxVolume(value: number): void {
  const gain = getGain()
  gain.gain.value = value
}

export function setSfxMuted(muted: boolean): void {
  const gain = getGain()
  gain.gain.value = muted ? 0 : useConfigStore.getState().sfxVolume
}
