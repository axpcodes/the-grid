import { useRef, useEffect, useLayoutEffect } from 'react'
import type { CellData } from '../types'
import { drawCell, getImage } from '../lib/renderCell'
import type { ImgCache } from '../lib/renderCell'
import { ACCENT, INK, PAPER, LINE, isTouch } from '../lib/ui'

export const COLS = 1000
export const ROWS = 1000
const CELL = 64            // world-space px per cell at zoom 1
const MIN_CELL_PX = 2.5    // most zoomed-out
const MAX_ZOOM = 8         // most zoomed-in (512px cells)
/** Taps on cells at least this many screen px wide open them; smaller ones fly in first. */
export const OPEN_PX = 22
const FLY_PX = 88          // cell size after flying to a cell

export interface GridApi {
  /** Smoothly fly to a cell. Resolves when the camera lands. */
  flyTo(row: number, col: number, opts?: { cellPx?: number; select?: boolean }): Promise<void>
  jumpTo(row: number, col: number, cellPx?: number): void
  pulse(row: number, col: number, strong?: boolean): void
  select(row: number, col: number): void
  clearSelection(): void
  centerCell(): { row: number; col: number }
  zoomBy(factor: number): void
  overview(): void
}

interface Props {
  cells: Map<string, CellData>
  apiRef: React.MutableRefObject<GridApi | null>
  /** Tap on a cell big enough to read — open it. */
  onOpen: (row: number, col: number, cell: CellData | null) => void
  onSelect: (sel: { row: number; col: number } | null) => void
}

const wrap = (n: number, max: number) => ((n % max) + max) % max
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function GridCanvas({ cells, apiRef, onOpen, onSelect }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const cellsRef    = useRef(cells)
  const onOpenRef   = useRef(onOpen)
  const onSelectRef = useRef(onSelect)
  const redrawRef   = useRef<() => void>(() => {})
  useLayoutEffect(() => { onOpenRef.current = onOpen; onSelectRef.current = onSelect })
  useLayoutEffect(() => { cellsRef.current = cells; redrawRef.current() }, [cells])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    // ── camera (CSS px) ────────────────────────────────────────────────────
    let W = 0, H = 0, dpr = 1
    let zoom = 6 / CELL
    let panX = 0, panY = 0
    const cw = () => CELL * zoom
    const minZoom = () => MIN_CELL_PX / CELL
    const clampZoom = (z: number) => Math.max(minZoom(), Math.min(MAX_ZOOM, z))
    /** Viewport center in (unwrapped) cell units. */
    const center = () => ({ u: (W / 2 - panX) / cw(), v: (H / 2 - panY) / cw() })
    const setCenter = (u: number, v: number, z: number) => {
      zoom = z
      panX = W / 2 - u * cw()
      panY = H / 2 - v * cw()
    }
    setCenter(COLS / 2, ROWS / 2, zoom)

    // ── state ──────────────────────────────────────────────────────────────
    const imgCache: ImgCache = new Map()
    const avgColor = new Map<string, string>()
    const bitmaps  = new Map<string, HTMLCanvasElement>()
    let bitmapPx = 0
    let selected: { row: number; col: number } | null = null
    let hovered:  { row: number; col: number } | null = null
    const pulses: { row: number; col: number; t0: number; strong: boolean }[] = []
    let fly: null | {
      u0: number; v0: number; z0: number; u1: number; v1: number; z1: number
      t0: number; ms: number; bump: number; done: () => void
    } = null
    let momentum: null | { vx: number; vy: number; last: number } = null
    let raf = 0

    const getCell = (r: number, c: number) => cellsRef.current.get(`${r}:${c}`) ?? null

    const onImageLoaded = () => { bitmaps.clear(); bitmapPx = 0; request() }

    /** What a claimed cell looks like when it's only a few px wide. */
    const markColor = (cell: CellData) => {
      const bg = cell.bgColor || '#ffffff'
      if (cell.imageUrl) {
        const cached = avgColor.get(cell.imageUrl)
        if (cached) return cached
        const img = getImage(imgCache, cell.imageUrl, onImageLoaded)
        if (img) {
          const c = document.createElement('canvas'); c.width = c.height = 1
          const x = c.getContext('2d')!
          x.drawImage(img, 0, 0, 1, 1)
          try {
            const [r, g, b] = x.getImageData(0, 0, 1, 1).data
            const col = `rgb(${r},${g},${b})`
            avgColor.set(cell.imageUrl, col)
            return col
          } catch { /* tainted canvas — fall through */ }
        }
      }
      // A white card with text would vanish against the paper — show it as ink.
      return /^#f{3}(f{3})?$/i.test(bg) ? '#6f665a' : bg
    }

    /** Claimed cells are rendered once per size bucket and reused every frame. */
    const bitmap = (cell: CellData, bucket: number) => {
      const key = `${cell.id}|${bucket}`
      let bmp = bitmaps.get(key)
      if (!bmp) {
        if (bitmapPx > 24e6) { bitmaps.clear(); bitmapPx = 0 }
        bmp = document.createElement('canvas')
        bmp.width = bmp.height = bucket
        drawCell(bmp.getContext('2d')!, {
          x: 0, y: 0, size: bucket,
          bgColor: cell.bgColor || '#ffffff',
          contentText: cell.contentText || undefined,
          imageUrl: cell.imageUrl || undefined,
          imgCache, onImageLoad: onImageLoaded,
        })
        bitmaps.set(key, bmp)
        bitmapPx += bucket * bucket
      }
      return bmp
    }

    // ── draw ───────────────────────────────────────────────────────────────
    const draw = (now: number) => {
      if (!W || !H) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, W, H)

      const s  = cw()
      const c0 = Math.floor(-panX / s), c1 = Math.floor((W - panX) / s)
      const r0 = Math.floor(-panY / s), r1 = Math.floor((H - panY) / s)
      const px = (c: number) => Math.floor(c * s + panX)
      const py = (r: number) => Math.floor(r * s + panY)

      // Grid lines fade in as cells grow
      if (s >= 5) {
        ctx.globalAlpha = Math.min(1, (s - 5) / 12)
        ctx.strokeStyle = LINE
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let c = c0; c <= c1 + 1; c++) { const x = px(c) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H) }
        for (let r = r0; r <= r1 + 1; r++) { const y = py(r) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y) }
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Claimed cells
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const drawClaimed = (cell: CellData, c: number, r: number) => {
        const x = px(c), y = py(r), size = px(c + 1) - x
        const dev = size * dpr
        if (dev < 7) {
          ctx.fillStyle = markColor(cell)
          ctx.fillRect(x, y, Math.max(1, size), Math.max(1, size))
        } else {
          const bucket = Math.min(1024, Math.max(16, 2 ** Math.ceil(Math.log2(dev))))
          ctx.drawImage(bitmap(cell, bucket), x, y, size, size)
        }
      }
      const all = cellsRef.current
      if ((c1 - c0 + 1) * (r1 - r0 + 1) <= all.size * 2) {
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const cell = getCell(wrap(r, ROWS), wrap(c, COLS))
            if (cell) drawClaimed(cell, c, r)
          }
      } else {
        // Far out: walk the (few) claimed cells instead of the (many) visible ones
        for (const cell of all.values()) {
          for (let c = c0 + wrap(cell.col - c0, COLS); c <= c1; c += COLS)
            for (let r = r0 + wrap(cell.row - r0, ROWS); r <= r1; r += ROWS)
              drawClaimed(cell, c, r)
        }
      }

      // Cell numbers on empty cells, once there's room to read them
      if (s > 44) {
        ctx.fillStyle = 'rgba(60,45,25,0.30)'
        ctx.font = `${Math.min(11, s * 0.12)}px 'JetBrains Mono', monospace`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const rr = wrap(r, ROWS), rc = wrap(c, COLS)
            if (!getCell(rr, rc)) ctx.fillText(`#${(rr * COLS + rc + 1).toLocaleString()}`, px(c) + 5, py(r) + 5)
          }
      }

      // Instances of a cell on screen (the wall wraps around)
      const each = (row: number, col: number, fn: (x: number, y: number, size: number) => void) => {
        for (let c = c0 - 1 + wrap(col - c0 + 1, COLS); c <= c1; c += COLS)
          for (let r = r0 - 1 + wrap(row - r0 + 1, ROWS); r <= r1; r += ROWS)
            fn(px(c), py(r), px(c + 1) - px(c))
      }

      if (hovered && (!selected || hovered.row !== selected.row || hovered.col !== selected.col)) {
        const claimed = !!getCell(hovered.row, hovered.col)
        each(hovered.row, hovered.col, (x, y, size) => {
          if (!claimed) { ctx.fillStyle = 'rgba(226,85,59,0.10)'; ctx.fillRect(x, y, size, size) }
          ctx.strokeStyle = INK; ctx.lineWidth = 1.5
          ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5)
        })
      }

      if (selected) {
        each(selected.row, selected.col, (x, y, size) => {
          ctx.strokeStyle = ACCENT
          if (size >= 10) {
            ctx.lineWidth = 3
            ctx.strokeRect(x - 1.5, y - 1.5, size + 3, size + 3)
          } else {
            // Too small to outline — draw a target ring around it
            ctx.lineWidth = 2
            ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, 11, 0, Math.PI * 2); ctx.stroke()
          }
        })
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        const dur = p.strong ? 2200 : 1400
        const t = (now - p.t0) / dur
        if (t >= 1) { pulses.splice(i, 1); continue }
        each(p.row, p.col, (x, y, size) => {
          const cx = x + size / 2, cy = y + size / 2
          const base = Math.max(size * 0.72, 8)
          for (let k = 0; k < (p.strong ? 2 : 1); k++) {
            const tk = Math.max(0, t - k * 0.18)
            if (tk <= 0) continue
            ctx.globalAlpha = (1 - tk) ** 2
            ctx.strokeStyle = ACCENT
            ctx.lineWidth = p.strong ? 3 : 2
            ctx.beginPath()
            ctx.arc(cx, cy, base + tk * (p.strong ? 70 : 34), 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
        })
      }
    }

    // ── frame loop (draws at most once per frame) ──────────────────────────
    const frame = (now: number) => {
      raf = 0
      let more = false
      if (fly) {
        const t = Math.min(1, (now - fly.t0) / fly.ms)
        const e = easeInOut(t)
        const lz = Math.log(fly.z0) + (Math.log(fly.z1) - Math.log(fly.z0)) * e - fly.bump * Math.sin(Math.PI * e)
        setCenter(fly.u0 + (fly.u1 - fly.u0) * e, fly.v0 + (fly.v1 - fly.v0) * e, Math.exp(lz))
        if (t >= 1) { const done = fly.done; fly = null; done() } else more = true
      }
      if (momentum) {
        const dt = Math.min(48, now - momentum.last)
        momentum.last = now
        panX += momentum.vx * dt
        panY += momentum.vy * dt
        const k = 0.9965 ** dt
        momentum.vx *= k; momentum.vy *= k
        if (Math.hypot(momentum.vx, momentum.vy) < 0.02) { momentum = null; settle() } else more = true
      }
      if (pulses.length) more = true
      draw(now)
      if (more) request()
    }
    const request = () => { if (!raf) raf = requestAnimationFrame(frame) }
    redrawRef.current = request

    // ── selection ──────────────────────────────────────────────────────────
    const setSelected = (sel: { row: number; col: number } | null) => {
      selected = sel
      onSelectRef.current(sel)
      request()
    }
    /** After a pan, drop the selection if it scrolled out of view. */
    const settle = () => {
      if (!selected) return
      const s = cw()
      const { u, v } = center()
      let du = selected.col + 0.5 - u; du -= COLS * Math.round(du / COLS)
      let dv = selected.row + 0.5 - v; dv -= ROWS * Math.round(dv / ROWS)
      if (Math.abs(du * s) > W / 2 + s || Math.abs(dv * s) > H / 2 + s) setSelected(null)
    }

    // ── camera moves ───────────────────────────────────────────────────────
    const flyTo: GridApi['flyTo'] = (row, col, opts = {}) => new Promise(resolve => {
      momentum = null
      const { u: u0, v: v0 } = center()
      let du = col + 0.5 - u0; du -= COLS * Math.round(du / COLS)
      let dv = row + 0.5 - v0; dv -= ROWS * Math.round(dv / ROWS)
      const z1 = clampZoom((opts.cellPx ?? Math.max(FLY_PX, cw())) / CELL)
      const dist = Math.hypot(du, dv) * cw()
      const span = Math.min(W, H)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (opts.select) setSelected({ row, col })
      if (reduce) { setCenter(u0 + du, v0 + dv, z1); request(); resolve(); return }
      fly = {
        u0, v0, z0: zoom, u1: u0 + du, v1: v0 + dv, z1,
        t0: performance.now(),
        ms: Math.min(1100, 520 + Math.log2(1 + dist / span) * 140 + Math.abs(Math.log(z1 / zoom)) * 60),
        bump: Math.max(0, Math.log(dist / span)) * 0.55,
        done: resolve,
      }
      request()
    })

    const zoomAt = (factor: number, sx: number, sy: number) => {
      const z = clampZoom(zoom * factor)
      panX = sx - (sx - panX) * (z / zoom)
      panY = sy - (sy - panY) * (z / zoom)
      zoom = z
      request()
    }

    apiRef.current = {
      flyTo,
      jumpTo(row, col, cellPx) {
        fly = null; momentum = null
        setCenter(col + 0.5, row + 0.5, clampZoom((cellPx ?? cw()) / CELL))
        request()
      },
      pulse(row, col, strong = false) { pulses.push({ row, col, t0: performance.now(), strong }); request() },
      select(row, col) { setSelected({ row, col }) },
      clearSelection() { setSelected(null) },
      centerCell() {
        const { u, v } = center()
        return { row: wrap(Math.floor(v), ROWS), col: wrap(Math.floor(u), COLS) }
      },
      zoomBy(f) {
        const { u, v } = center()
        const c = { row: Math.floor(v), col: Math.floor(u) }
        void flyTo(wrap(c.row, ROWS), wrap(c.col, COLS), { cellPx: clampZoom(zoom * f) * CELL })
      },
      overview() {
        const { u, v } = center()
        void flyTo(wrap(Math.floor(v), ROWS), wrap(Math.floor(u), COLS), { cellPx: MIN_CELL_PX })
      },
    }

    // ── resize (keeps the same spot centered) ──────────────────────────────
    const resize = () => {
      const { u, v } = center()
      W = canvas.clientWidth
      H = canvas.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width  = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      bitmaps.clear(); bitmapPx = 0
      setCenter(u, v, clampZoom(zoom))
      draw(performance.now())
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // ── input: one pointer = pan/tap, two pointers = pinch ─────────────────
    const pts = new Map<number, { x: number; y: number }>()
    let gesture: null | {
      sx: number; sy: number; moved: boolean; multi: boolean; type: string
      samples: { x: number; y: number; t: number }[]
    } = null
    let pinch: null | { dist: number; mx: number; my: number } = null
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const toCell = (x: number, y: number) => ({
      row: wrap(Math.floor((y - panY) / cw()), ROWS),
      col: wrap(Math.floor((x - panX) / cw()), COLS),
    })
    const pinchState = () => {
      const [a, b] = [...pts.values()]
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      const p = local(e)
      pts.set(e.pointerId, p)
      fly = null; momentum = null
      if (pts.size === 1) {
        gesture = { sx: p.x, sy: p.y, moved: false, multi: false, type: e.pointerType, samples: [{ ...p, t: e.timeStamp }] }
      } else if (pts.size === 2) {
        if (gesture) gesture.multi = true
        pinch = pinchState()
      }
    }

    const onMove = (e: PointerEvent) => {
      const p = local(e)
      if (!pts.has(e.pointerId)) {
        if (e.pointerType === 'mouse') { hovered = toCell(p.x, p.y); request() }
        return
      }
      const prev = pts.get(e.pointerId)!
      pts.set(e.pointerId, p)
      if (pts.size >= 2 && pinch) {
        const next = pinchState()
        panX += next.mx - pinch.mx
        panY += next.my - pinch.my
        zoomAt(next.dist / pinch.dist, next.mx, next.my)
        pinch = next
        return
      }
      if (!gesture) return
      if (!gesture.moved && Math.hypot(p.x - gesture.sx, p.y - gesture.sy) > (gesture.type === 'mouse' ? 4 : 9)) {
        gesture.moved = true
        hovered = null
      }
      if (gesture.moved) {
        panX += p.x - prev.x
        panY += p.y - prev.y
        gesture.samples.push({ ...p, t: e.timeStamp })
        if (gesture.samples.length > 6) gesture.samples.shift()
        request()
      }
    }

    const onUp = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      const p = local(e)
      pts.delete(e.pointerId)
      if (pts.size === 1) {
        pinch = null
        return  // remaining finger keeps panning; gesture stays non-tap
      }
      if (pts.size > 0 || !gesture) return
      const g = gesture
      gesture = null
      if (e.type === 'pointercancel') return

      if (!g.moved && !g.multi) {
        // Clean tap
        const { row, col } = toCell(p.x, p.y)
        if (cw() >= OPEN_PX) {
          setSelected({ row, col })
          onOpenRef.current(row, col, getCell(row, col))
        } else {
          void flyTo(row, col, { select: true })
        }
        return
      }
      if (g.moved && !g.multi) {
        // Fling: carry the release velocity
        const a = g.samples[0], b = g.samples[g.samples.length - 1]
        const dt = b.t - a.t
        if (dt > 0 && e.timeStamp - b.t < 60) {
          const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt
          if (Math.hypot(vx, vy) > 0.25) { momentum = { vx, vy, last: performance.now() }; request(); return }
        }
      }
      settle()
    }

    const onLeave = () => { hovered = null; request() }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      fly = null; momentum = null
      const r = canvas.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      } else {
        panX -= e.deltaX
        panY -= e.deltaY
        hovered = toCell(e.clientX - r.left, e.clientY - r.top)
        request()
      }
    }

    canvas.addEventListener('pointerdown',   onDown)
    canvas.addEventListener('pointermove',   onMove)
    canvas.addEventListener('pointerup',     onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave',  onLeave)
    canvas.addEventListener('wheel',         onWheel, { passive: false })

    return () => {
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
      redrawRef.current = () => {}
      apiRef.current = null
      canvas.removeEventListener('pointerdown',   onDown)
      canvas.removeEventListener('pointermove',   onMove)
      canvas.removeEventListener('pointerup',     onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave',  onLeave)
      canvas.removeEventListener('wheel',         onWheel)
    }
  }, [apiRef])

  const touch = isTouch()

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'default' }}
      />

      {/* Zoom controls — touch devices get just "overview" (pinch does the rest) */}
      <div style={{
        position: 'absolute', left: 14, bottom: 'calc(14px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 2, padding: 3, borderRadius: 14,
        background: 'rgba(255,253,248,0.92)', border: `1px solid ${LINE}`,
        boxShadow: '0 4px 18px rgba(40,30,15,0.10)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}>
        {!touch && (
          <>
            <CtrlBtn title="Zoom in" onClick={() => apiRef.current?.zoomBy(2)}>
              <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </CtrlBtn>
            <CtrlBtn title="Zoom out" onClick={() => apiRef.current?.zoomBy(0.5)}>
              <path d="M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </CtrlBtn>
          </>
        )}
        <CtrlBtn title="See the whole wall" onClick={() => apiRef.current?.overview()} size={touch ? 44 : 36}>
          <rect x="3.5" y="3.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
          <rect x="11.5" y="3.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
          <rect x="3.5" y="11.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
          <rect x="11.5" y="11.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
        </CtrlBtn>
      </div>
    </div>
  )
}

function CtrlBtn({ onClick, title, size = 36, children }: {
  onClick: () => void; title: string; size?: number; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: size, height: size, border: 'none', borderRadius: 11, background: 'transparent',
        color: INK, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerDown={e => (e.currentTarget.style.background = 'rgba(26,23,20,0.07)')}
      onPointerUp={e => (e.currentTarget.style.background = 'transparent')}
      onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">{children}</svg>
    </button>
  )
}

