import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import { getWindowPosition, setWindowPosition, showChatWindow, hideChatWindow, getScreenInfo, setChatWindowPosition, getCursorPosition } from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250

// ── Expressions ──────────────────────────────────────────────────────────
type Expression = 'idle' | 'annoyed' | 'dizzy' | 'sleepy' | 'happy' | 'surprised' | 'shy' | 'mad'

// ── Jellyfish anatomy ────────────────────────────────────────────────────
const BELL_SEGS = 80
const BELL_W = 32
const BELL_H = 24
const BELL_BASE_Y = 38
const TENT_COUNT = 4
const TENT_SEGS = 12
const TENT_LEN = 32

// ── Tentacle ─────────────────────────────────────────────────────────────
interface TPoint { x: number; y: number; vx: number; vy: number }
interface Tentacle {
  pts: TPoint[]
  sx: number
  phase: number
  speed: number
  amp: number
  damp: number
  width: number
}

function makeTentacles(): Tentacle[] {
  return Array.from({ length: TENT_COUNT }, (_, i) => {
    const spread = 22
    const sx = -spread / 2 + (i / (TENT_COUNT - 1)) * spread
    const pts: TPoint[] = Array.from({ length: TENT_SEGS }, (_, j) => ({
      x: sx,
      y: BELL_BASE_Y + (j / TENT_SEGS) * TENT_LEN,
      vx: 0,
      vy: 0,
    }))
    return {
      pts, sx,
      phase: i * 1.3 + Math.random() * 0.5,
      speed: 0.5 + Math.random() * 0.4,
      amp: 1.5 + Math.random() * 1.2,
      damp: 0.90 + Math.random() * 0.05,
      width: 3.5 + Math.random() * 2.0,
    }
  })
}

// ── Bioluminescent organs ────────────────────────────────────────────────
interface Organ {
  bx: number; by: number
  size: number; bright: number
  phase: number; speed: number
}

function makeOrgans(): Organ[] {
  return [
    { bx: -8, by: -5, size: 4.5, bright: 1, phase: 0, speed: 1.1 },
    { bx: 6, by: -3, size: 3.5, bright: 0.8, phase: 1.8, speed: 0.9 },
    { bx: -2, by: 2, size: 3.0, bright: 0.7, phase: 3.2, speed: 1.0 },
    { bx: 10, by: -1, size: 2.2, bright: 0.55, phase: 4.5, speed: 0.8 },
    { bx: -11, by: 0, size: 2.0, bright: 0.45, phase: 2.5, speed: 1.2 },
  ]
}

// ── Bell path ────────────────────────────────────────────────────────────
function traceBell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  time: number,
) {
  ctx.beginPath()
  for (let i = 0; i <= BELL_SEGS; i++) {
    const a = (i / BELL_SEGS) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    let bx: number, by: number

    if (sa <= 0) {
      const wobble = Math.sin(a * 3 + time * 0.5) * 0.6
      bx = cx + ca * (BELL_W + wobble) * sx
      by = cy + sa * BELL_H * sy
    } else {
      const rimTuck = 1 - Math.pow(ca, 2) * 0.1
      const rimFlare = Math.pow(Math.abs(ca), 0.5) * 3
      bx = cx + ca * BELL_W * rimTuck * sx
      by = cy + sa * BELL_H * sy + rimFlare
    }

    if (i === 0) ctx.moveTo(bx, by)
    else ctx.lineTo(bx, by)
  }
  ctx.closePath()
}

// ── Color Interpolation ──────────────────────────────────────────────────
function lerpAngle(current: number, target: number, speed: number) {
  let diff = (target - current) % 360
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return (current + diff * speed + 360) % 360
}

function lerpValue(current: number, target: number, speed: number) {
  return current + (target - current) * speed
}

// ── Component ───────────────────────────────────────────────────────────
export function BlobCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const setTextboxOpen = useConfigStore((s) => s.setTextboxOpen)
  const isDragging = useConfigStore((s) => s.isDragging)
  const setIsDragging = useConfigStore((s) => s.setIsDragging)
  const setBlobScreenPos = useConfigStore((s) => s.setBlobScreenPos)
  const isProcessing = useChatStore((s) => s.isProcessing)

  const isPointerDownRef = useRef(false)
  const isDraggingRef = useRef(false)
  const didDragRef = useRef(false)
  const startScreenRef = useRef<{ x: number; y: number } | null>(null)
  const startWindowRef = useRef<{ x: number; y: number } | null>(null)

  // Eye state
  const eyeTargetRef = useRef({ x: 0, y: 0 })
  const eyePosRef = useRef({ x: 0, y: 0 })
  const blinkTimerRef = useRef(0)
  const nextBlinkThresholdRef = useRef(8 + Math.random() * 8)  // 8-16s interval
  const isBlinkingRef = useRef(false)
  const blinkPhaseRef = useRef(0)
  // Drag velocity for ocean jellyfish lean
  const dragVelRef = useRef({ x: 0, y: 0 })
  // Smooth drag blend: 0 = normal wave, 1 = full jellyfish lean
  const dragBlendRef = useRef(0)
  // Smoothed squint
  const squintCurrentRef = useRef(0)
  // Staged post-drag transitions
  const postDragDizzyRef = useRef(0)   // 1s dizziness fade after drag ends
  const postDragPauseRef = useRef(0)   // 0.5s calm pause before mad
  // Mad cooldown
  const madCooldownRef = useRef(0)
  const madTotalRef = useRef(0)
  const prevDraggingRef = useRef(false)
  // Happy: ref so it persists across effect re-runs (drag state changes re-run the effect)
  const happyCooldownRef = useRef(0)
  // Blocks happy from triggering for 30s after a rage phase ends
  const madRecoveryRef = useRef(0)
  // Petting detection: horizontal wiggles near the blob
  const petScoreRef = useRef(0)
  const lastSignRef = useRef(0)
  const lastPetTimeRef = useRef(0)
  // Color transition states (lerping color gradient pairs)
  const color1Ref = useRef({ h: 180, s: 70, l: 65 })
  const color2Ref = useRef({ h: 230, s: 60, l: 50 })
  // Custom spin angle and smooth rage transitions
  const dizzySpinAngleRef = useRef(0)
  const madAlphaRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const w = 140
    const h = 160
    const cx = w / 2
    const cy = 50

    const tents = makeTentacles()
    const organs = makeOrgans()

    // ── Expression tracking ────────────────────────────────────────
    let dragStartTime = 0
    let lastInteractionTime = Date.now()
    let lastMouseTime = Date.now()
    let mouseSpeed = 0
    let mouseNearBlob = false
    // happyCooldown is a ref (not a local let) so it survives effect re-runs
    let dizzyStars: { angle: number; dist: number; speed: number }[] = []
    let dizzyWobble = 0

    // Track system cursor for eye direction (works even outside window)
    let blobScreenX = 0
    let blobScreenY = 0
    let lastCursorX = 0
    let lastCursorY = 0

    // Get initial blob position
    getWindowPosition().then((wp) => {
      blobScreenX = wp.x + cx
      blobScreenY = wp.y + cy
    }).catch(() => {})

    // Poll system cursor at ~60fps
    const cursorInterval = setInterval(() => {
      Promise.all([getCursorPosition(), getWindowPosition()]).then(([cursor, wp]) => {
        blobScreenX = wp.x + cx
        blobScreenY = wp.y + cy

        const dx = cursor.x - blobScreenX
        const dy = cursor.y - blobScreenY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const maxShift = 3.5
        if (dist > 0) {
          eyeTargetRef.current = {
            x: (dx / dist) * Math.min(maxShift, dist * 0.05),
            y: (dy / dist) * Math.min(maxShift, dist * 0.05),
          }
        }

        // Mouse speed tracking
        const now = Date.now()
        const dt = (now - lastMouseTime) / 1000
        let moved = false
        if (dt > 0) {
          const dmx = cursor.x - lastCursorX
          const dmy = cursor.y - lastCursorY
          mouseSpeed = Math.sqrt(dmx * dmx + dmy * dmy) / dt
          if (Math.abs(dmx) > 0.5 || Math.abs(dmy) > 0.5) {
            moved = true
          }

          // Smooth drag velocity for broom-trail (only care when dragging)
          if (isDragging) {
            dragVelRef.current.x = dragVelRef.current.x * 0.6 + dmx * 0.4
            dragVelRef.current.y = dragVelRef.current.y * 0.6 + dmy * 0.4
          } else {
            // Decay back to zero when not dragging
            dragVelRef.current.x *= 0.8
            dragVelRef.current.y *= 0.8
          }

          // Petting detection: hover over it left and right wiggles
          // Only checks if not currently dragging, close to the blob, and rage sequence blocks are clear
          const inRageSequence = postDragDizzyRef.current > 0
            || postDragPauseRef.current > 0
            || madCooldownRef.current > 0
          if (!isDragging && dist < 85 && !inRageSequence && madRecoveryRef.current <= 0) {
            if (Math.abs(dmx) > 1.0) {
              const currentSign = dmx > 0 ? 1 : -1
              if (lastSignRef.current !== currentSign) {
                petScoreRef.current += 1
                lastPetTimeRef.current = now
                lastSignRef.current = currentSign
              }
            }
          }
        }

        // Decay petting score if no patting happens for 1.2s
        if (now - lastPetTimeRef.current > 1200) {
          petScoreRef.current = 0
          lastSignRef.current = 0
        }

        // Trigger happy mode if enough alternating pats are detected
        if (petScoreRef.current >= 4) {
          petScoreRef.current = 0
          lastSignRef.current = 0
          happyCooldownRef.current = 60 + Math.random() * 60 // 60-120 seconds of pure joy
        }

        lastCursorX = cursor.x
        lastCursorY = cursor.y
        lastMouseTime = now
        // Sleep mode activation fix: only update lastInteractionTime on actual mouse movement or drag
        if (moved || isDragging) {
          lastInteractionTime = now
        }

        // Is mouse near blob?
        mouseNearBlob = dist < 120
      }).catch(() => {})
    }, 16)

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000

      // ── Expression determination ─────────────────────────────────
      const now = Date.now()
      const idleMs = now - lastInteractionTime
      
      // Calculate how long we've been dragging up to this moment
      // (do not clear until after checking drag-release staged transitions)
      const dragMs = dragStartTime === 0 ? 0 : now - dragStartTime

      // Detect drag-release → staged transition: 2s decelerating dizzy (if was dizzy) → 0.5s pause → 7-9s mad
      if (prevDraggingRef.current && !isDragging) {
        if (dragMs > 2500) {
          postDragDizzyRef.current = 2.0   // 2 seconds of slow-mo recovery
        } else {
          postDragDizzyRef.current = 0
        }
        postDragPauseRef.current = 0.5     // 0.5s calm pause before mad
        madCooldownRef.current = 0
        madTotalRef.current = 0
        happyCooldownRef.current = 0       // cancel happy on drag release
      }
      prevDraggingRef.current = isDragging

      // Start or stop drag timer
      if (isDragging) {
        if (dragStartTime === 0) {
          dragStartTime = now
          happyCooldownRef.current = 0 // cancel happy if dragged
        }
      } else {
        dragStartTime = 0
      }

      let expression: Expression = 'idle'

      if (isProcessing) {
        expression = 'idle'
      } else if (isDragging) {
        if (dragMs > 2500) expression = 'dizzy'
        else expression = 'annoyed'
      } else if (postDragDizzyRef.current > 0) {
        // Phase 1: dizziness decelerates over 2 seconds
        postDragDizzyRef.current -= 1 / 60
        if (postDragDizzyRef.current <= 0) {
          postDragDizzyRef.current = 0
        }
        expression = 'dizzy'
      } else if (postDragPauseRef.current > 0) {
        // Phase 2: brief calm before rage kicks in
        postDragPauseRef.current -= 1 / 60
        if (postDragPauseRef.current <= 0) {
          postDragPauseRef.current = 0
          const dur = 7 + Math.random() * 2  // 7–9s (2s longer)
          madCooldownRef.current = dur
          madTotalRef.current = dur
        }
        expression = 'idle'
      } else if (madCooldownRef.current > 0) {
        madCooldownRef.current -= 1 / 60
        // When mad phase fully ends, set a 30s recovery block so happy can't follow rage
        if (madCooldownRef.current <= 0) {
          madRecoveryRef.current = 30
        }
        expression = 'mad'
      } else if (happyCooldownRef.current > 0) {
        happyCooldownRef.current -= 1 / 60
        expression = 'happy'
      } else if (idleMs > 8000) {
        expression = 'sleepy'
      } else if (mouseSpeed > 800 && mouseNearBlob) {
        expression = 'surprised'
      } else if (mouseNearBlob) {
        expression = 'shy'
      }

      // Decay the post-mad recovery timer
      if (madRecoveryRef.current > 0) madRecoveryRef.current -= 1 / 60

      // Happy: rare (0.00001/frame ≈ once per ~138 min avg, 5x rarer), long (60-120s)
      // Blocked during and for 30s after any rage sequence
      const inRageSequence = postDragDizzyRef.current > 0
        || postDragPauseRef.current > 0
        || madCooldownRef.current > 0
      if (expression === 'idle'
        && !isDragging
        && !isProcessing
        && !inRageSequence
        && madRecoveryRef.current <= 0
        && happyCooldownRef.current <= 0
        && Math.random() < 0.00001) {
        happyCooldownRef.current = 60 + Math.random() * 60  // 60-120s
        expression = 'happy'
      }

      // ── Target Colors for each mode ──────────────────────────────
      let target1 = { h: 180, s: 70, l: 65 }
      let target2 = { h: 230, s: 60, l: 50 }

      if (isDragging) {
        // Dragged mode
        target1 = { h: 195, s: 75, l: 65 }
        target2 = { h: 270, s: 70, l: 50 }
      } else if (expression === 'mad') {
        // Angry mode
        target1 = { h: 0, s: 80, l: 60 }
        target2 = { h: 300, s: 70, l: 45 }
      } else if (expression === 'happy') {
        // Happy mode: Sunburst Yellow-Orange
        target1 = { h: 55, s: 95, l: 62 }
        target2 = { h: 22, s: 95, l: 52 }
      } else if (expression === 'sleepy') {
        // Idle/Sleep mode
        target1 = { h: 245, s: 50, l: 45 }
        target2 = { h: 285, s: 45, l: 35 }
      } else {
        // Normal mode (idle, annoyed, surprised, shy, processing)
        target1 = { h: 180, s: 70, l: 65 }
        target2 = { h: 230, s: 60, l: 50 }
      }

      // Add dynamic breathing to saturation and lightness
      // Happy pulses faster, Sleepy pulses slower and deeper
      const pulseSpeed = expression === 'happy' ? 4.5 : expression === 'sleepy' ? 1.5 : 3.0
      const pulseAmpS = expression === 'sleepy' ? 3 : 6
      const pulseAmpL = expression === 'sleepy' ? 5 : 4
      
      const satOffset = Math.sin(t * pulseSpeed) * pulseAmpS
      const litOffset = Math.cos(t * (pulseSpeed * 1.1)) * pulseAmpL

      target1.s = Math.max(10, Math.min(100, target1.s + satOffset))
      target1.l = Math.max(10, Math.min(95, target1.l + litOffset))
      target2.s = Math.max(10, Math.min(100, target2.s - satOffset)) // out of phase
      target2.l = Math.max(10, Math.min(95, target2.l - litOffset))

      const c1 = color1Ref.current
      const c2 = color2Ref.current

      // Lerp speed: 0.025 for smooth transitions (~0.8s to fully switch)
      const lerpSpd = 0.025
      c1.h = lerpAngle(c1.h, target1.h, lerpSpd)
      c1.s = lerpValue(c1.s, target1.s, lerpSpd)
      c1.l = lerpValue(c1.l, target1.l, lerpSpd)

      c2.h = lerpAngle(c2.h, target2.h, lerpSpd)
      c2.s = lerpValue(c2.s, target2.s, lerpSpd)
      c2.l = lerpValue(c2.l, target2.l, lerpSpd)

      // hue is computed dynamically from c1.h
      const hue = c1.h

      // Dizzy stars fade out over 2 seconds of slow-mo recovery
      const dizzyAlpha = isDragging ? 1 : Math.min(1, postDragDizzyRef.current / 1.5)

      // Compute spin velocity and progress
      let spinVel = 0
      let dizzyProgress = 0
      if (expression === 'dizzy') {
        if (isDragging) {
          spinVel = 4.0
          dizzyProgress = 1.0
        } else if (postDragDizzyRef.current > 0) {
          dizzyProgress = postDragDizzyRef.current / 2.0  // 1.0 -> 0.0
          spinVel = 4.0 * dizzyProgress
        }
      }
      dizzySpinAngleRef.current += spinVel * (1 / 60)

      // Update madAlpha for gradual eye transitions
      if (expression === 'mad') {
        madAlphaRef.current = Math.min(1, madAlphaRef.current + 1 / 30) // fade-in
      } else {
        madAlphaRef.current = Math.max(0, madAlphaRef.current - 1 / 90) // fade-out (1.5s)
      }

      if (expression === 'dizzy') {
        dizzyWobble = Math.sin(t * 6) * 3
        // Only spawn new stars during active drag dizziness, not during fade-out
        if (isDragging && dizzyStars.length < 5 && Math.random() < 0.05) {
          dizzyStars.push({
            angle: Math.random() * Math.PI * 2,
            dist: 14 + Math.random() * 6,
            speed: 1.5 + Math.random() * 1,
          })
        }
        for (const star of dizzyStars) {
          // Stars decelerate orbit during slow-mo
          star.angle += star.speed * (1 / 60) * dizzyProgress
        }
        // Gradually drain stars during post-drag fade so they disappear naturally
        if (!isDragging && Math.random() < 0.04 && dizzyStars.length > 0) {
          dizzyStars.pop()
        }
      } else {
        dizzyStars = []
        dizzyWobble *= 0.9
      }

      // ── Pulse ─────────────────────────────────────────────────────
      const pp = t * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))
      const pulse = Math.sin(pp)
      const sx = 1 + pulse * 0.06 + dizzyWobble * 0.01
      const sy = 1 - pulse * 0.08
      const pm = isProcessing ? 2.0 : 1.0

      // ── Eye tracking ──────────────────────────────────────────────
      const ep = eyePosRef.current
      const et = eyeTargetRef.current

      // Dizzy eyes spin instead of tracking (decelerates to stop during slow-mo)
      if (expression === 'dizzy') {
        const spinAngle = dizzySpinAngleRef.current
        const progress = postDragDizzyRef.current > 0 ? (postDragDizzyRef.current / 2.0) : 1.0
        const orbitRadius = 2.5 * progress
        eyeTargetRef.current = {
          x: Math.cos(spinAngle) * orbitRadius,
          y: Math.sin(spinAngle) * orbitRadius,
        }
      }

      // Shy eyes look toward mouse (but offset slightly)
      if (expression === 'shy') {
        // Keep normal tracking but减弱
        et.x *= 0.6
        et.y *= 0.6
      }

      ep.x += (et.x - ep.x) * 0.08
      ep.y += (et.y - ep.y) * 0.08

      // Blink: 8-16s intervals, 0.4s animation (slow and natural)
      if (!isDragging) {
        blinkTimerRef.current += 1 / 60
        if (!isBlinkingRef.current && blinkTimerRef.current >= nextBlinkThresholdRef.current) {
          isBlinkingRef.current = true
          blinkPhaseRef.current = 0
          blinkTimerRef.current = 0
          nextBlinkThresholdRef.current = 8 + Math.random() * 8  // next blink in 8-16s
        }
      } else {
        isBlinkingRef.current = false
        blinkPhaseRef.current = 0
        blinkTimerRef.current = 0
      }
      if (isBlinkingRef.current) {
        blinkPhaseRef.current += 1 / 60
        if (blinkPhaseRef.current > 0.4) {  // 0.4s duration — noticeably slow
          isBlinkingRef.current = false
          blinkPhaseRef.current = 0
        }
      }
      const blinkAmount = isBlinkingRef.current
        ? Math.sin((blinkPhaseRef.current / 0.4) * Math.PI)
        : 0

      // Eye squint — compute target then lerp current toward it (smooth, not instant)
      let squintTarget = 0
      if (isProcessing) squintTarget = 0.15
      else if (expression === 'annoyed') squintTarget = 0.12
      else if (expression === 'mad') squintTarget = 0.45
      else if (expression === 'sleepy') squintTarget = 0.35
      else if (expression === 'shy') squintTarget = 0.05
      squintCurrentRef.current += (squintTarget - squintCurrentRef.current) * 0.035
      const squint = squintCurrentRef.current

      // Happy eyes = ^_^ (no blink, just curved)
      const isHappyEyes = expression === 'happy'
      // Surprised = extra wide
      const isSurprised = expression === 'surprised'
      const isSleepy = expression === 'sleepy'

      // ── Tentacle physics: ocean jellyfish drag ───────────────────────────────
      // dragBlend eases in/out so there's never an instant physics switch
      const blendTarget = (isDragging && expression !== 'dizzy') ? 1 : 0
      dragBlendRef.current += (blendTarget - dragBlendRef.current)
        * (blendTarget > dragBlendRef.current ? 0.07 : 0.035)
      const dragBlend = dragBlendRef.current

      // Compute unified lean direction: ALL tentacles lean TOGETHER in the
      // direction OPPOSITE to motion, max 15° — like a jellyfish in the ocean
      const dVx = dragVelRef.current.x
      const dVy = dragVelRef.current.y
      const rawSpeed = Math.sqrt(dVx * dVx + dVy * dVy)
      const MAX_LEAN_PX = Math.tan(15 * Math.PI / 180) * TENT_LEN  // ~8.6px at tip
      const leanScale = rawSpeed > 0.5 ? Math.min(MAX_LEAN_PX / rawSpeed, 1) : 0
      // Trailing unit vector (opposite to motion)
      const leanUx = rawSpeed > 0.5 ? (-dVx / rawSpeed) * leanScale * dragBlend : 0
      const leanUy = rawSpeed > 0.5 ? (-dVy / rawSpeed) * leanScale * dragBlend * 0.4 : 0

      for (const ten of tents) {
        const ax = cx + ten.sx * sx
        const ay = cy + BELL_BASE_Y * sy
        ten.pts[0].x = ax
        ten.pts[0].y = ay

        // During drag: reduce wave amplitude so legs don't flail
        const tentAmp = expression === 'dizzy'
          ? ten.amp * 2.0
          : ten.amp * (1 - dragBlend * 0.75)
        const tentSpeed = expression === 'dizzy' ? ten.speed * 1.8 : ten.speed

        for (let i = 1; i < ten.pts.length; i++) {
          const p = ten.pts[i]
          const f = i / TENT_SEGS  // 0=root, 1=tip

          // Gentle wave (always present, attenuated during drag)
          const wave = Math.sin(t * tentSpeed * pm + ten.phase + f * 2.8) * tentAmp * f

          // Normal rest position
          const normalTx = ax + wave
          const normalTy = ay + f * TENT_LEN

          // Jellyfish lean: uniform angular sweep, linear with depth
          // All legs lean the same direction (no per-tentacle chaos)
          const dragTx = ax + wave * 0.25 + leanUx * f * TENT_LEN
          const dragTy = ay + f * TENT_LEN + leanUy * f * TENT_LEN

          // Smooth blend between rest and lean
          const tx = normalTx + (dragTx - normalTx) * dragBlend
          const ty = normalTy + (dragTy - normalTy) * dragBlend

          // Blended spring: stiffer at rest, softer during drag for fluid lag
          const springK = 0.038 - 0.022 * dragBlend

          p.vx += (tx - p.x) * springK
          p.vy += (ty - p.y) * springK
          p.vx *= ten.damp
          p.vy *= ten.damp
          p.x += p.vx
          p.y += p.vy
        }
      }

      // ── Organ positions ───────────────────────────────────────────
      const organPos = organs.map((o) => ({
        x: cx + o.bx * sx + Math.sin(t * o.speed * 0.4 + o.phase) * 1.2,
        y: cy + o.by * sy + Math.cos(t * o.speed * 0.3 + o.phase) * 0.8,
      }))

      // ══════════════════════════════════════════════════════════════
      // LAYER 1 — Ambient glow (strong, wide)
      // ══════════════════════════════════════════════════════════════
      const glowR = 58
      const gG = ctx.createRadialGradient(cx, cy, 6, cx, cy, glowR)
      gG.addColorStop(0, `hsla(${c1.h}, ${c1.s}%, ${c1.l}%, 0.28)`)
      gG.addColorStop(0.35, `hsla(${(c1.h + c2.h) / 2}, ${(c1.s + c2.s) / 2}%, ${(c1.l + c2.l) / 2}%, 0.14)`)
      gG.addColorStop(0.7, `hsla(${c2.h}, ${c2.s}%, ${c2.l}%, 0.05)`)
      gG.addColorStop(1, `hsla(${c2.h}, ${c2.s}%, ${c2.l}%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fillStyle = gG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 2 — Tentacles (tapering, flowing)
      // ══════════════════════════════════════════════════════════════
      for (const ten of tents) {
        for (let i = 0; i < ten.pts.length - 1; i++) {
          const f0 = i / (ten.pts.length - 1)
          const f1 = (i + 1) / (ten.pts.length - 1)
          const w0 = ten.width * (1 - f0 * 0.8)
          const a0 = 0.35 * (1 - f0 * 0.75)
          const a1 = 0.35 * (1 - f1 * 0.75)

          ctx.beginPath()
          ctx.moveTo(ten.pts[i].x, ten.pts[i].y)
          ctx.lineTo(ten.pts[i + 1].x, ten.pts[i + 1].y)

          const segG = ctx.createLinearGradient(
            ten.pts[i].x, ten.pts[i].y,
            ten.pts[i + 1].x, ten.pts[i + 1].y,
          )
          const hSeg = c1.h + (c2.h - c1.h) * f0
          const sSeg = c1.s + (c2.s - c1.s) * f0
          const lSeg = c1.l + (c2.l - c1.l) * f0
          
          const hSegNext = c1.h + (c2.h - c1.h) * f1
          const sSegNext = c1.s + (c2.s - c1.s) * f1
          const lSegNext = c1.l + (c2.l - c1.l) * f1

          segG.addColorStop(0, `hsla(${hSeg}, ${sSeg}%, ${lSeg}%, ${a0})`)
          segG.addColorStop(1, `hsla(${hSegNext}, ${sSegNext}%, ${lSegNext}%, ${a1})`)
          ctx.strokeStyle = segG
          ctx.lineWidth = w0
          ctx.lineCap = 'round'
          ctx.stroke()
        }
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 3 — Bell body (transparent with strong glow center)
      // ══════════════════════════════════════════════════════════════
      traceBell(ctx, cx, cy, sx, sy, t)
      const bG = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy + 2, BELL_H + 6)
      bG.addColorStop(0, `hsla(${c1.h}, ${c1.s}%, 88%, ${0.22 + pulse * 0.06})`)
      bG.addColorStop(0.2, `hsla(${c1.h}, ${c1.s}%, ${c1.l}%, 0.28)`)
      bG.addColorStop(0.5, `hsla(${(c1.h + c2.h) / 2}, ${(c1.s + c2.s) / 2}%, ${(c1.l + c2.l) / 2}%, 0.28)`)
      bG.addColorStop(0.8, `hsla(${c2.h}, ${c2.s}%, ${c2.l}%, 0.24)`)
      bG.addColorStop(1, `hsla(${c2.h}, ${c2.s}%, ${c2.l - 5}%, 0.20)`)
      ctx.fillStyle = bG
      ctx.fill()

      // Bright center glow (drawn inside clipped bell)
      ctx.save()
      traceBell(ctx, cx, cy, sx, sy, t)
      ctx.clip()
      const coreG = ctx.createRadialGradient(cx, cy - 3, 0, cx, cy - 3, BELL_H * 0.65)
      coreG.addColorStop(0, `hsla(${c1.h}, ${c1.s}%, 95%, ${0.40 + pulse * 0.12})`)
      coreG.addColorStop(0.4, `hsla(${c1.h}, ${c1.s}%, 80%, 0.22)`)
      coreG.addColorStop(1, `hsla(${c1.h}, ${c1.s}%, ${c1.l}%, 0)`)
      ctx.fillStyle = coreG
      ctx.fillRect(cx - BELL_W - 5, cy - BELL_H - 5, (BELL_W + 5) * 2, (BELL_H + 5) * 2)
      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 4 — Inner glow + organs (clipped to bell)
      // ══════════════════════════════════════════════════════════════
      ctx.save()
      traceBell(ctx, cx, cy, sx, sy, t)
      ctx.clip()

      // Inner radial glow
      const iG = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy, BELL_H * 0.8)
      iG.addColorStop(0, `hsla(${c1.h}, ${c1.s}%, 80%, ${0.18 + (pulse + 1) * 0.06})`)
      iG.addColorStop(0.5, `hsla(${c2.h}, ${c2.s}%, 65%, ${0.08})`)
      iG.addColorStop(1, `hsla(${c2.h}, ${c2.s}%, ${c2.l}%, 0)`)
      ctx.fillStyle = iG
      ctx.fillRect(0, 0, w, h)

      // Organs with halos
      for (let i = 0; i < organs.length; i++) {
        const o = organs[i]
        const pos = organPos[i]
        const op = Math.sin(t * o.speed + o.phase) * 0.3 + 0.7
        const ob = o.bright * op * (isProcessing ? 1.5 : 1.0)

        // Halo (stronger)
        const ohG = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, o.size * 2.8)
        ohG.addColorStop(0, `hsla(${c1.h + 20}, ${c1.s}%, 78%, ${0.16 * ob})`)
        ohG.addColorStop(0.4, `hsla(${c1.h + 10}, ${c1.s}%, 62%, ${0.06 * ob})`)
        ohG.addColorStop(1, `hsla(${c1.h}, ${c1.s}%, 48%, 0)`)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, o.size * 2.8, 0, Math.PI * 2)
        ctx.fillStyle = ohG
        ctx.fill()

        // Core (brighter)
        const oG = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, o.size)
        oG.addColorStop(0, `hsla(${c1.h + 15}, ${c1.s}%, 85%, ${0.45 * ob})`)
        oG.addColorStop(0.4, `hsla(${c1.h + 5}, ${c1.s}%, 70%, ${0.20 * ob})`)
        oG.addColorStop(1, `hsla(${c1.h}, ${c1.s}%, 50%, 0)`)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, o.size, 0, Math.PI * 2)
        ctx.fillStyle = oG
        ctx.fill()
      }

      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 5 — Bell membrane (subtle edge stroke)
      // ══════════════════════════════════════════════════════════════
      traceBell(ctx, cx, cy, sx, sy, t)
      const mG = ctx.createLinearGradient(cx - BELL_W, cy - BELL_H, cx + BELL_W, cy + BELL_H * 0.5)
      mG.addColorStop(0, `hsla(${c1.h}, ${c1.s}%, 68%, 0.12)`)
      mG.addColorStop(0.5, `hsla(${(c1.h + c2.h) / 2}, ${(c1.s + c2.s) / 2}%, 55%, 0.08)`)
      mG.addColorStop(1, `hsla(${c2.h}, ${c2.s}%, 50%, 0.04)`)
      ctx.strokeStyle = mG
      ctx.lineWidth = 1.0
      ctx.stroke()

      // ══════════════════════════════════════════════════════════════
      // LAYER 6 — EYES
      // ══════════════════════════════════════════════════════════════
      const eyeSpacing = 9
      const eyeY = cy - 2
      const eyeRadius = 5.5
      const eyeH = eyeRadius * (1 - squint) * (1 - blinkAmount)
      const eyeW = eyeRadius * (isSurprised ? 1.2 : 1)

      // Pre-compute mad alpha for use in both eyes and overlay
      const madAlpha = madAlphaRef.current
      const isMadEyes = madAlpha > 0.01

      for (let side = -1; side <= 1; side += 2) {
        const ex = cx + side * eyeSpacing * sx
        const ey = eyeY

        if (isMadEyes) {
          // Rage eyes: upside down full closed half circle, tilted (flat top, curved bottom, no eyebrows)
          // Left eye (side=-1): rotate CW — inner end dips → /
          // Right eye (side=+1): rotate CCW — inner end dips → \
          // Together: / \ = angry look
          ctx.save()
          ctx.translate(ex, ey)
          ctx.rotate(-side * 0.35)  // inner end dips down
          ctx.beginPath()
          ctx.arc(0, 0, eyeRadius * 0.85, 0, Math.PI)
          ctx.fillStyle = `hsla(0, 0%, 5%, ${0.95 * madAlpha})`
          ctx.fill()
          ctx.restore()
        } else if (isHappyEyes) {
          ctx.beginPath()
          ctx.arc(ex, ey + 1, eyeRadius * 0.7, Math.PI + 0.4, -0.4)
          ctx.strokeStyle = `hsla(0, 0%, 5%, 0.90)`
          ctx.lineWidth = 2.2
          ctx.lineCap = 'round'
          ctx.stroke()
        } else if (isSleepy) {
          // Closed sleeping eyes: a gentle curved line (like a smile / cup shape ︶)
          ctx.beginPath()
          ctx.arc(ex, ey - 1, eyeRadius * 0.75, 0.4, Math.PI - 0.4)
          ctx.strokeStyle = `hsla(0, 0%, 5%, 0.85)`
          ctx.lineWidth = 2.2
          ctx.lineCap = 'round'
          ctx.stroke()
        } else {
          // Normal eyes; fade out toward drag >< and toward mad arcs
          const normalAlpha = (1 - dragBlend * 0.85) * (1 - madAlpha)

          const trackX = ep.x * 1.2
          const trackY = ep.y * 1.2
          const pupilX = ex + trackX
          const pupilY = ey + trackY

          ctx.beginPath()
          ctx.ellipse(pupilX, pupilY, eyeW, eyeH, 0, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(0, 0%, 3%, ${0.95 * normalAlpha})`
          ctx.fill()

          const irisX = ex + trackX * 0.7
          const irisY = ey + trackY * 0.7
          const irisR = eyeW * 0.65
          ctx.beginPath()
          ctx.arc(irisX, irisY, irisR, 0, Math.PI * 2)
          ctx.strokeStyle = `hsla(${hue + 20}, 30%, 18%, ${0.35 * normalAlpha})`
          ctx.lineWidth = 1.0
          ctx.stroke()

          const shX = pupilX + 2 - trackX * 0.2
          const shY = pupilY - 2 - trackY * 0.2
          const shG = ctx.createRadialGradient(shX, shY, 0, shX, shY, 2.2)
          shG.addColorStop(0, `hsla(0, 0%, 100%, ${0.70 * (1 - blinkAmount) * normalAlpha})`)
          shG.addColorStop(0.5, `hsla(0, 0%, 100%, ${0.25 * (1 - blinkAmount) * normalAlpha})`)
          shG.addColorStop(1, `hsla(0, 0%, 100%, 0)`)
          ctx.beginPath()
          ctx.arc(shX, shY, 2.2, 0, Math.PI * 2)
          ctx.fillStyle = shG
          ctx.fill()

          const sh2X = pupilX - 1.5 - trackX * 0.15
          const sh2Y = pupilY + 1.5 - trackY * 0.15
          ctx.beginPath()
          ctx.arc(sh2X, sh2Y, 1.0, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(0, 0%, 100%, ${0.25 * (1 - blinkAmount) * normalAlpha})`
          ctx.fill()

          // >< overlay fades in with dragBlend
          if (dragBlend > 0.01) {
            const arm = eyeRadius * 0.85
            ctx.save()
            ctx.translate(ex, ey)
            const tipX = -side * arm
            ctx.strokeStyle = `hsla(0, 0%, 5%, ${0.92 * dragBlend})`
            ctx.lineWidth = 2.4
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(side * arm, -arm * 0.65)
            ctx.lineTo(tipX, 0)
            ctx.lineTo(side * arm, arm * 0.65)
            ctx.stroke()
            ctx.restore()
          }
        }
      }

      // ── Expression overlays ─────────────────────────────────────

      // Mad: red glow + anger vein. Eyes are handled above (tilted arcs). NO eyebrows.
      if (madAlpha > 0.01) {
        const madPulse = Math.sin(t * 8) * 0.15 + 0.85

        // Red tint glow over the bell
        ctx.save()
        traceBell(ctx, cx, cy, sx, sy, t)
        ctx.clip()
        const madG = ctx.createRadialGradient(cx, cy, 0, cx, cy, BELL_W)
        madG.addColorStop(0, `hsla(0, 80%, 50%, ${0.18 * madAlpha * madPulse})`)
        madG.addColorStop(1, `hsla(0, 70%, 40%, 0)`)
        ctx.fillStyle = madG
        ctx.fillRect(0, 0, w, h)
        ctx.restore()

        // Anger vein 💢 — 4-bracket cross, top-right of head
        const vx = cx + 14
        const vy = cy - BELL_H * 0.85
        const vs = 5.5 * madPulse
        const va = madAlpha * (0.7 + Math.sin(t * 12) * 0.3)
        ctx.strokeStyle = `hsla(0, 90%, 55%, ${va})`
        ctx.lineWidth = 1.8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
        for (const [dx, dy] of corners) {
          ctx.beginPath()
          ctx.moveTo(vx + dx * vs, vy + dy * vs * 0.45)
          ctx.lineTo(vx + dx * vs * 0.45, vy + dy * vs * 0.45)
          ctx.lineTo(vx + dx * vs * 0.45, vy + dy * vs)
          ctx.stroke()
        }
      }

      // Dizzy: spiral eyes + orbiting stars (with dizzyAlpha fade during post-drag)
      if (expression === 'dizzy') {
        for (let side = -1; side <= 1; side += 2) {
          const ex = cx + side * eyeSpacing * sx
          const ey = eyeY
          ctx.save()
          ctx.translate(ex, ey)
          ctx.rotate(dizzySpinAngleRef.current)
          ctx.beginPath()
          for (let s = 0; s < 20; s++) {
            const sa = (s / 20) * Math.PI * 4
            const sr = (s / 20) * 3.5
            const sx2 = Math.cos(sa) * sr
            const sy2 = Math.sin(sa) * sr
            if (s === 0) ctx.moveTo(sx2, sy2)
            else ctx.lineTo(sx2, sy2)
          }
          ctx.strokeStyle = `hsla(0, 0%, 95%, ${0.7 * dizzyAlpha})`
          ctx.lineWidth = 1.2
          ctx.stroke()
          ctx.restore()
        }

        for (const star of dizzyStars) {
          const starX = cx + Math.cos(star.angle) * star.dist * sx
          const starY = cy - 6 + Math.sin(star.angle) * star.dist * 0.4
          const starSize = 1.5 + Math.sin(t * 8 + star.angle) * 0.5
          ctx.fillStyle = `hsla(50, 90%, 75%, ${0.8 * dizzyAlpha})`
          ctx.beginPath()
          for (let p = 0; p < 4; p++) {
            const pa = (p / 4) * Math.PI * 2 - Math.PI / 2
            const outerX = starX + Math.cos(pa) * starSize
            const outerY = starY + Math.sin(pa) * starSize
            const innerPa = pa + Math.PI / 4
            const innerX = starX + Math.cos(innerPa) * starSize * 0.3
            const innerY = starY + Math.sin(innerPa) * starSize * 0.3
            if (p === 0) ctx.moveTo(outerX, outerY)
            else ctx.lineTo(outerX, outerY)
            ctx.lineTo(innerX, innerY)
          }
          ctx.closePath()
          ctx.fill()
        }
      }

      // Sleepy: floating zzz
      if (expression === 'sleepy') {
        // Floating zzz
        const zzz = ['z', 'Z', 'z']
        for (let i = 0; i < 3; i++) {
          const zt = (t * 0.8 + i * 0.7) % 3
          const zx = cx + 16 + i * 4 + Math.sin(zt * 2) * 2
          const zy = cy - 10 - zt * 8
          const za = Math.max(0, 1 - zt / 3)
          const zSize = 5 + i * 1.5
          ctx.font = `bold ${zSize}px sans-serif`
          ctx.fillStyle = `hsla(${hue}, 40%, 80%, ${za * 0.6})`
          ctx.fillText(zzz[i], zx, zy)
        }
      }

      // Surprised: small "o" mouth
      if (expression === 'surprised') {
        ctx.beginPath()
        ctx.arc(cx, cy + 8, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(0, 0%, 5%, 0.6)`
        ctx.fill()
      }

      // Shy: slight blush marks
      if (expression === 'shy') {
        for (let side = -1; side <= 1; side += 2) {
          const bx = cx + side * (eyeSpacing + 5) * sx
          const by = eyeY + 4
          const blushG = ctx.createRadialGradient(bx, by, 0, bx, by, 4)
          blushG.addColorStop(0, `hsla(${hue + 340}, 60%, 60%, 0.25)`)
          blushG.addColorStop(1, `hsla(${hue + 340}, 50%, 55%, 0)`)
          ctx.beginPath()
          ctx.arc(bx, by, 4, 0, Math.PI * 2)
          ctx.fillStyle = blushG
          ctx.fill()
        }
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 7 — Specular highlight on bell
      // ══════════════════════════════════════════════════════════════
      const spX = cx - 8
      const spY = cy - BELL_H * 0.55
      const spG = ctx.createRadialGradient(spX, spY, 0, spX, spY, 9)
      spG.addColorStop(0, `hsla(${hue}, 30%, 98%, 0.50)`)
      spG.addColorStop(0.3, `hsla(${hue}, 40%, 92%, 0.22)`)
      spG.addColorStop(0.6, `hsla(${hue}, 45%, 85%, 0.08)`)
      spG.addColorStop(1, `hsla(${hue}, 50%, 80%, 0)`)
      ctx.beginPath()
      ctx.ellipse(spX, spY, 9, 4.5, -0.2, 0, Math.PI * 2)
      ctx.fillStyle = spG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 8 — Processing rings
      // ══════════════════════════════════════════════════════════════
      if (isProcessing) {
        const pp2 = Math.sin(t * 4) * 0.3 + 0.7

        ctx.beginPath()
        ctx.arc(cx, cy - 2, BELL_W + 4, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 72%, 65%, ${0.12 * pp2})`
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(cx, cy - 2, BELL_W + 8, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 62%, 55%, ${0.05 * pp2})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ── Hue sync ──────────────────────────────────────────────────
      localStorage.setItem('blob-hue', String(Math.round(c1.h)))
      localStorage.setItem('blob-sat', String(Math.round(c1.s)) + '%')
      localStorage.setItem('blob-light', String(Math.round(c1.l)) + '%')

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(cursorInterval)
    }
  }, [isProcessing, isDragging])

  // ── Interaction ──────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    isPointerDownRef.current = true
    isDraggingRef.current = false
    didDragRef.current = false
    startScreenRef.current = { x: e.screenX, y: e.screenY }

    getWindowPosition().then((wp) => {
      startWindowRef.current = wp
      setBlobScreenPos({ x: wp.x + 70, y: wp.y + 80 })
    }).catch(() => {})

    const onMove = (me: MouseEvent) => {
      if (!isPointerDownRef.current || !startScreenRef.current || !startWindowRef.current) return
      const dx = me.screenX - startScreenRef.current.x
      const dy = me.screenY - startScreenRef.current.y
      if (!isDraggingRef.current) {
        if (Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) return
        isDraggingRef.current = true
        didDragRef.current = true
        setIsDragging(true)
      }
      const nx = startWindowRef.current.x + dx
      const ny = startWindowRef.current.y + dy
      setWindowPosition(nx, ny).catch(() => {})
      setBlobScreenPos({ x: nx + 70, y: ny + 80 })

      if (useConfigStore.getState().textboxOpen) {
        getScreenInfo().then((sc) => {
          let chatX = Math.max(sc.x, Math.min(nx + 70 - CHAT_W * 0.5, sc.x + sc.width - CHAT_W))
          let chatY = Math.max(sc.y, Math.min(ny + 160 + 5, sc.y + sc.height - CHAT_H_EXPANDED))
          setChatWindowPosition(chatX, chatY).catch(() => {})
        }).catch(() => {})
      }
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!isPointerDownRef.current) return
      isPointerDownRef.current = false

      if (!didDragRef.current) {
        const open = useConfigStore.getState().textboxOpen
        if (open) {
          setTextboxOpen(false)
          hideChatWindow().catch(() => {})
        } else {
          Promise.all([getWindowPosition(), getScreenInfo()]).then(([wp, sc]) => {
            let chatX = Math.max(sc.x, Math.min(wp.x + 70 - CHAT_W * 0.5, sc.x + sc.width - CHAT_W))
            let chatY = Math.max(sc.y, Math.min(wp.y + 160 + 5, sc.y + sc.height - CHAT_H_COLLAPSED))
            setBlobScreenPos({ x: wp.x + 70, y: wp.y + 50 })
            setTextboxOpen(true)
            showChatWindow(chatX, chatY).catch(() => {})
          }).catch(() => {})
        }
      }

      isDraggingRef.current = false
      didDragRef.current = false
      startScreenRef.current = null
      startWindowRef.current = null
      setIsDragging(false)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [setIsDragging, setTextboxOpen, setBlobScreenPos])

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={140}
      height={160}
      className="fixed z-20 cursor-grab active:cursor-grabbing"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        touchAction: 'none',
        backgroundColor: 'transparent',
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    />
  )
}
