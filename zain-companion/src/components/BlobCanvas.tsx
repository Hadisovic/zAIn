import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import { getWindowPosition, setWindowPosition, showChatWindow, hideChatWindow, getScreenSize, setChatWindowPosition } from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250

// ── Fractal anatomy ──────────────────────────────────────────────────────
const FRACTAL_POINTS = 180
const BASE_RADIUS = 28
const OCTAVES = 5
const DETAIL_RINGS = 3

// ── Simplex-like noise (fast approximation) ─────────────────────────────
function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}

function fbm(x: number, y: number, octaves: number): number {
  let value = 0
  let amplitude = 1
  let frequency = 1
  let maxValue = 0
  for (let i = 0; i < octaves; i++) {
    value += amplitude * (noise2D(x * frequency, y * frequency) * 2 - 1)
    maxValue += amplitude
    amplitude *= 0.5
    frequency *= 2.1
  }
  return value / maxValue
}

// ── Fractal surface ──────────────────────────────────────────────────────
interface FractalPoint {
  angle: number
  baseR: number
  r: number
  detailR: number
}

function makeFractalSurface(): FractalPoint[] {
  return Array.from({ length: FRACTAL_POINTS }, (_, i) => {
    const angle = (i / FRACTAL_POINTS) * Math.PI * 2
    return { angle, baseR: BASE_RADIUS, r: BASE_RADIUS, detailR: BASE_RADIUS }
  })
}

function updateFractal(pts: FractalPoint[], t: number, isProcessing: boolean) {
  const timeScale = isProcessing ? 1.5 : 1.0
  const chaosMult = isProcessing ? 1.6 : 1.0

  for (const p of pts) {
    // Large-scale morphing (3 harmonics)
    const largeMorph =
      Math.sin(p.angle * 2 + t * 0.4) * 3.0 +
      Math.cos(p.angle * 3 - t * 0.3) * 2.0 +
      Math.sin(p.angle * 5 + t * 0.6) * 1.2

    // Fractal detail — fbm at the angle + time
    const nx = Math.cos(p.angle) * 3 + t * 0.2 * timeScale
    const ny = Math.sin(p.angle) * 3 + t * 0.15 * timeScale
    const fractalDetail = fbm(nx, ny, OCTAVES) * 8 * chaosMult

    // Fine noise — high frequency micro-detail
    const micro = Math.sin(p.angle * 23 + t * 2.5) * 0.4

    p.baseR = BASE_RADIUS + largeMorph
    p.r = p.baseR + fractalDetail + micro

    // Secondary detail ring (inner structure visible through translucency)
    const dnx = Math.cos(p.angle + t * 0.1) * 2
    const dny = Math.sin(p.angle + t * 0.08) * 2
    p.detailR = BASE_RADIUS * 0.65 + fbm(dnx, dny, 3) * 5
  }
}

function traceFractalPath(
  ctx: CanvasRenderingContext2D,
  pts: FractalPoint[],
  cx: number,
  cy: number,
  radiusMul: number = 1,
) {
  ctx.beginPath()
  for (let i = 0; i <= pts.length; i++) {
    const curr = pts[i % pts.length]
    const next = pts[(i + 1) % pts.length]
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const r = curr.r * radiusMul
    const x = cx + Math.cos(curr.angle) * r
    const y = cy + Math.sin(curr.angle) * r
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      const pr = prev.r * radiusMul
      const nr = next.r * radiusMul
      const cpx1 = x + (Math.cos(curr.angle) - Math.cos(prev.angle)) * r * 0.18
      const cpy1 = y + (Math.sin(curr.angle) - Math.sin(prev.angle)) * r * 0.18
      const cpx2 = x - (Math.cos(next.angle) - Math.cos(curr.angle)) * r * 0.18
      const cpy2 = y - (Math.sin(next.angle) - Math.sin(curr.angle)) * r * 0.18
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x, y)
    }
  }
  ctx.closePath()
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
  const screenSizeRef = useRef<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2

    const fractal = makeFractalSurface()

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000
      const hue = isProcessing ? 270 : isDragging ? 200 : (t * BLOB.HUE_SPEED) % 360
      const pm = isProcessing ? 1.4 : 1.0

      // ── Pulse ─────────────────────────────────────────────────────
      const pp = t * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))
      const pulse = Math.sin(pp)
      const pI = (pulse + 1) * 0.5

      // ── Update fractal ────────────────────────────────────────────
      updateFractal(fractal, t, isProcessing)

      // ══════════════════════════════════════════════════════════════
      // LAYER 1 — Outer fractal halo (distant echo)
      // ══════════════════════════════════════════════════════════════
      const haloG = ctx.createRadialGradient(cx, cy, BASE_RADIUS * 0.8, cx, cy, BASE_RADIUS + 22)
      haloG.addColorStop(0, `hsla(${hue}, 60%, 60%, 0.08)`)
      haloG.addColorStop(0.5, `hsla(${hue}, 50%, 50%, 0.03)`)
      haloG.addColorStop(1, `hsla(${hue}, 40%, 40%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, BASE_RADIUS + 22, 0, Math.PI * 2)
      ctx.fillStyle = haloG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 2 — Fractal detail rings (visible internal structure)
      // ══════════════════════════════════════════════════════════════
      for (let ring = DETAIL_RINGS; ring >= 1; ring--) {
        const ringFrac = ring / DETAIL_RINGS
        const ringR = BASE_RADIUS * (0.35 + ringFrac * 0.35)
        const ringAlpha = 0.04 * (1 - ringFrac * 0.5) * pm

        ctx.beginPath()
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2
          const nx = Math.cos(a + t * 0.1 * ring) * 2
          const ny = Math.sin(a + t * 0.08 * ring) * 2
          const detail = fbm(nx, ny, 3) * 4
          const r = ringR + detail
          const x = cx + Math.cos(a) * r
          const y = cy + Math.sin(a) * r
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.strokeStyle = `hsla(${hue + ring * 8}, 55%, 65%, ${ringAlpha})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 3 — Fractal body fill
      // ══════════════════════════════════════════════════════════════
      traceFractalPath(ctx, fractal, cx, cy)

      // Layered gradient for depth
      const bodyG = ctx.createRadialGradient(cx, cy, 0, cx, cy, BASE_RADIUS + 10)
      bodyG.addColorStop(0, `hsla(${hue + 15}, 50%, 72%, 0.55)`)
      bodyG.addColorStop(0.25, `hsla(${hue + 8}, 55%, 60%, 0.50)`)
      bodyG.addColorStop(0.5, `hsla(${hue}, 60%, 50%, 0.55)`)
      bodyG.addColorStop(0.75, `hsla(${hue - 8}, 65%, 42%, 0.60)`)
      bodyG.addColorStop(1, `hsla(${hue - 15}, 70%, 35%, 0.65)`)
      ctx.fillStyle = bodyG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 4 — Inner glow (smooth core, contrasting with fractal edge)
      // ══════════════════════════════════════════════════════════════
      ctx.save()
      traceFractalPath(ctx, fractal, cx, cy)
      ctx.clip()

      const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, BASE_RADIUS * 0.7)
      coreG.addColorStop(0, `hsla(${hue + 25}, 45%, 85%, ${0.25 + pI * 0.12})`)
      coreG.addColorStop(0.4, `hsla(${hue + 15}, 55%, 72%, ${0.12 + pI * 0.06})`)
      coreG.addColorStop(0.7, `hsla(${hue + 5}, 60%, 60%, ${0.04})`)
      coreG.addColorStop(1, `hsla(${hue}, 65%, 50%, 0)`)
      ctx.fillStyle = coreG
      ctx.fillRect(0, 0, w, h)

      // ══════════════════════════════════════════════════════════════
      // LAYER 5 — Mandelbrot-inspired spiral detail (inside the core)
      // ══════════════════════════════════════════════════════════════
      const spiralCount = isProcessing ? 5 : 3
      for (let s = 0; s < spiralCount; s++) {
        const sa = t * (0.15 + s * 0.08) + s * 2.4
        ctx.beginPath()
        for (let i = 0; i <= 80; i++) {
          const f = i / 80
          const a = sa + f * Math.PI * 4
          const r = f * BASE_RADIUS * 0.6
          const wobble = Math.sin(f * 12 + t * 1.5) * 0.5
          const x = cx + Math.cos(a) * (r + wobble)
          const y = cy + Math.sin(a) * (r + wobble)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `hsla(${hue + 10 + s * 5}, 55%, 70%, ${0.06 * pm})`
        ctx.lineWidth = 0.6
        ctx.stroke()
      }

      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 6 — Fractal boundary (the signature element)
      // ══════════════════════════════════════════════════════════════
      // Outer boundary — sharp
      traceFractalPath(ctx, fractal, cx, cy)
      ctx.strokeStyle = `hsla(${hue}, 50%, 65%, 0.18)`
      ctx.lineWidth = 0.8
      ctx.stroke()

      // Middle boundary — glow
      traceFractalPath(ctx, fractal, cx, cy)
      ctx.strokeStyle = `hsla(${hue + 5}, 55%, 60%, 0.08)`
      ctx.lineWidth = 2.5
      ctx.stroke()

      // Inner boundary — wide glow
      traceFractalPath(ctx, fractal, cx, cy)
      ctx.strokeStyle = `hsla(${hue + 10}, 60%, 55%, 0.03)`
      ctx.lineWidth = 5
      ctx.stroke()

      // ══════════════════════════════════════════════════════════════
      // LAYER 7 — Fractal tendrils (protrusions that reach outward)
      // ══════════════════════════════════════════════════════════════
      const tendrilCount = isProcessing ? 8 : 5
      for (let i = 0; i < tendrilCount; i++) {
        const ta = (i / tendrilCount) * Math.PI * 2 + t * 0.05
        const pt = fractal[Math.floor((ta / (Math.PI * 2)) * FRACTAL_POINTS) % FRACTAL_POINTS]
        if (!pt) continue

        const baseR = pt.r
        const tendrilLen = 6 + Math.sin(t * 1.5 + i * 1.7) * 3
        const tendrilAngle = ta + Math.sin(t * 0.8 + i * 2.3) * 0.3

        const tx = cx + Math.cos(tendrilAngle) * (baseR + tendrilLen)
        const ty = cy + Math.sin(tendrilAngle) * (baseR + tendrilLen)

        const tG = ctx.createLinearGradient(
          cx + Math.cos(tendrilAngle) * baseR,
          cy + Math.sin(tendrilAngle) * baseR,
          tx, ty,
        )
        tG.addColorStop(0, `hsla(${hue}, 55%, 60%, 0.12)`)
        tG.addColorStop(0.5, `hsla(${hue + 5}, 50%, 55%, 0.06)`)
        tG.addColorStop(1, `hsla(${hue + 10}, 45%, 50%, 0)`)

        ctx.beginPath()
        ctx.moveTo(
          cx + Math.cos(tendrilAngle) * baseR,
          cy + Math.sin(tendrilAngle) * baseR,
        )
        ctx.lineTo(tx, ty)
        ctx.strokeStyle = tG
        ctx.lineWidth = 1.5
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 8 — Specular highlight
      // ══════════════════════════════════════════════════════════════
      const spX = cx - 6
      const spY = cy - BASE_RADIUS * 0.35
      const spG = ctx.createRadialGradient(spX, spY, 0, spX, spY, 7)
      spG.addColorStop(0, `hsla(${hue + 30}, 30%, 96%, 0.55)`)
      spG.addColorStop(0.35, `hsla(${hue + 20}, 40%, 90%, 0.22)`)
      spG.addColorStop(0.7, `hsla(${hue + 10}, 50%, 82%, 0.04)`)
      spG.addColorStop(1, `hsla(${hue}, 60%, 75%, 0)`)
      ctx.beginPath()
      ctx.ellipse(spX, spY, 7, 4, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = spG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 9 — Processing (fractal acceleration)
      // ══════════════════════════════════════════════════════════════
      if (isProcessing) {
        const pp2 = Math.sin(t * 4) * 0.3 + 0.7

        // Energy rings
        for (let r = 0; r < 2; r++) {
          const ringPhase = (t * 2.2 + r * 1.0) % 2.5
          const ringAlpha = ringPhase < 1.2 ? ringPhase / 1.2 : (2.5 - ringPhase) / 1.3
          const ringR = BASE_RADIUS + 4 + ringPhase * 12

          ctx.beginPath()
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
          ctx.strokeStyle = `hsla(${hue + 10}, 60%, 65%, ${0.08 * ringAlpha * pp2})`
          ctx.lineWidth = 1
          ctx.stroke()
        }

        // Fractal burst (many small protrusions)
        for (let b = 0; b < 12; b++) {
          const ba = (b / 12) * Math.PI * 2 + t * 0.3
          const br = BASE_RADIUS + 5 + Math.sin(t * 3 + b * 1.3) * 4
          const bx = cx + Math.cos(ba) * br
          const by = cy + Math.sin(ba) * br

          ctx.beginPath()
          ctx.arc(bx, by, 1.2, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${hue + 15}, 60%, 72%, ${0.15 * pp2})`
          ctx.fill()
        }
      }

      // ── Hue sync ──────────────────────────────────────────────────
      localStorage.setItem('blob-hue', String(Math.round(hue)))

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
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

    getScreenSize().then((s) => { screenSizeRef.current = s }).catch(() => {})
    getWindowPosition().then((wp) => {
      startWindowRef.current = wp
      setBlobScreenPos({ x: wp.x + 60, y: wp.y + 60 })
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
      setBlobScreenPos({ x: nx + 60, y: ny + 60 })
      if (useConfigStore.getState().textboxOpen) {
        const sc = screenSizeRef.current || { width: 1920, height: 1080 }
        let chatX = Math.max(0, Math.min(nx + 60 - CHAT_W * 0.5, sc.width - CHAT_W))
        let chatY = Math.max(0, Math.min(ny + BLOB.SIZE + 10, sc.height - CHAT_H_EXPANDED))
        setChatWindowPosition(chatX, chatY).catch(() => {})
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
          Promise.all([getWindowPosition(), getScreenSize()]).then(([wp, sc]) => {
            let chatX = Math.max(0, Math.min(wp.x + 60 - CHAT_W * 0.5, sc.width - CHAT_W))
            let chatY = Math.max(0, Math.min(wp.y + BLOB.SIZE + 10, sc.height - CHAT_H_COLLAPSED))
            setBlobScreenPos({ x: wp.x + 60, y: wp.y + BLOB.SIZE - 60 })
            setTextboxOpen(true)
            showChatWindow(chatX, chatY).catch(() => {})
          }).catch(() => {})
        }
      }

      isDraggingRef.current = false
      didDragRef.current = false
      startScreenRef.current = null
      startWindowRef.current = null
      screenSizeRef.current = null
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
      width={BLOB.SIZE}
      height={BLOB.SIZE}
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
