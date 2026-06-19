# Jelli Sound Effects System — Design Spec

**Date:** 2026-06-19
**Status:** Approved
**Scope:** Add 6 cute, bubbly sound effects to the jellyfish blob for different interaction states

---

## Overview

Add sound effects to Jelli that trigger on specific blob interactions and expression changes. Sounds are pre-made WAV files loaded and played via the Web Audio API. A new SFX manager handles loading, playback, volume control, and mute. SFX blocks TTS playback (stops TTS, plays SFX, then TTS can resume).

## Sound Map

| Event | Trigger | Sound | Duration |
|-------|---------|-------|----------|
| **Click** | User clicks/taps the blob | Soft bubble pop | ~0.2s |
| **Sleep** | Blob transitions to sleepy expression | Gentle descending chime + soft snore | ~1.5s |
| **Wake** | Blob wakes from sleep (any non-sleepy expression) | Bright ascending chime | ~0.8s |
| **Happy** | Blob enters happy expression | Cheerful sparkle jingle | ~1.0s |
| **Dizzy** | Blob enters dizzy expression | Wobbly warble | ~0.8s |
| **Mad** | Blob enters mad expression | Grumpy puff | ~0.6s |

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/lib/sfx.ts` | SFX manager: load, play, volume, mute |
| `public/sounds/click.wav` | Click/pop sound |
| `public/sounds/sleep.wav` | Sleep sound |
| `public/sounds/wake.wav` | Wake sound |
| `public/sounds/happy.wav` | Happy sound |
| `public/sounds/dizzy.wav` | Dizzy sound |
| `public/sounds/mad.wav` | Mad sound |

### Modified Files

| File | Changes |
|------|---------|
| `src/stores/config.ts` | Add `sfxVolume` (number 0-1) and `sfxMuted` (boolean) |
| `src/components/BlobCanvas.tsx` | Play SFX on expression change + click |
| `src/components/SettingsPanel.tsx` | Add Sound Effects section (volume slider + mute toggle) |
| `src/lib/audio.ts` | Ensure `stop()` is exported and callable |

## SFX Manager API (`src/lib/sfx.ts`)

```typescript
export async function loadSounds(): Promise<void>
// Fetch + decode all 6 WAV files into AudioBuffers at startup

export function play(soundName: SoundName): void
// Stop TTS if playing, play the sound with current volume settings

export function setSfxVolume(value: number): void
// Set volume (0-1), updates GainNode in real-time

export function setSfxMuted(muted: boolean): void
// Mute/unmute all SFX

type SoundName = 'click' | 'sleep' | 'wake' | 'happy' | 'dizzy' | 'mad'
```

## Data Flow

```
App startup
  → loadSounds() — predecode all WAV files into AudioBuffer cache

BlobCanvas expression changes
  → sfx.play('happy')
    → if muted, return
    → audioPlayer.stop() (stops TTS if playing)
    → lookup AudioBuffer from cache
    → create BufferSourceNode
    → connect to GainNode (volume from config store)
    → connect to AudioContext.destination
    → source.start()

Blob click
  → sfx.play('click')
    → (same flow as above)
```

## Config Store Additions

```typescript
// src/stores/config.ts
sfxVolume: number      // 0-1, default 0.7
sfxMuted: boolean      // default false
```

Persisted to `settings.json` via existing `save_settings`/`load_settings` Rust commands.

## Settings Panel

New "Sound Effects" section in SettingsPanel:
- **Volume slider**: 0-100% range, maps to 0-1
- **Mute toggle**: Checkbox to mute/unmute all SFX

## Sound File Requirements

- Format: WAV (PCM, uncompressed)
- Sample rate: 44.1kHz
- Channels: Mono
- Bit depth: 16-bit
- Duration: 0.2-1.5s per file
- Total size: ~50KB for all 6 files
- Source: freesound.org, mixkit.co, or generated with sfxr/Bfxr

## Edge Cases

1. **Rapid expression changes** — debounce: don't play same sound twice within 500ms
2. **SFX during TTS** — stop TTS first (user confirmed: SFX blocks TTS)
3. **Volume changes during playback** — GainNode updates in real-time
4. **Mute toggle** — sets gain to 0, no playback interrupted
5. **App startup** — preload all sounds, ready before first interaction
6. **Missing sound file** — gracefully skip, log warning, no crash

## Implementation Order

1. Create `src/lib/sfx.ts` (load + play + volume + mute)
2. Add `sfxVolume` and `sfxMuted` to config store
3. Add Sound Effects section to SettingsPanel
4. Wire BlobCanvas expression changes to SFX triggers
5. Add click handler to BlobCanvas for click sound
6. Create placeholder WAV files (procedurally generated)
7. Update PROGRESS.md
8. Commit and push
