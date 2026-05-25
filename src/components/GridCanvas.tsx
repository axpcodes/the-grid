import { useRef, useEffect, useLayoutEffect, useState } from 'react'
import type { CellData } from '../types'
import { drawCell } from '../lib/renderCell'
import type { ImgCache } from '../lib/renderCell'

export const COLS = 1000
export const ROWS = 1000
const CELL_SIZE = 64  // world-space pixels per cell
const MIN_CELL_PX = 3
const MAX_ZOOM = 8

interface Props {
  cells: Map<string, CellData>
  onCellClick: (row: number, col: number, data: CellData | null) => void
  goToCellRef?: React.MutableRefObject<((row: number, col: number) => void) | null>
}

// ── Desktop zoom controls ─────────────────────────────────────────────────────
function CtrlBtn({
  onClick, title, active, children,
}: {
  onClick: () => void; title: string; active?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? '#dbeafe' : 'transparent',
        border: 'none', borderRadius: '7px',
        width: '32px', height: '32px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: '16px',
        color: active ? '#2563eb' : '#374151',
        fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function GridCanvas({ cells, onCellClick, goToCellRef }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const cellsRef   = useRef(cells)
  const onClickRef = useRef(onCellClick)
  useLayoutEffect(() => { cellsRef.current   = cells }, [cells])
  useLayoutEffect(() => { onClickRef.current = onCellClick }, [onCellClick])

  // Trigger redraw when cells change
  const drawRef = useRef<(() => void) | null>(null)
  useEffect(() => { drawRef.current?.() }, [cells])

  // Rubber-band zoom mode (desktop only)
  const [zoomMode, setZoomMode] = useState(false)
  const zoomModeRef = useRef(false)
  useLayoutEffect(() => { zoomModeRef.current = zoomMode }, [zoomMode])

  // Control functions written by the effect; called from the controls overlay
  const zoomInRef  = useRef<() => void>(() => {})
  const zoomOutRef = useRef<() => void>(() => {})
  const homeRef    = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current!
    const imgCache: ImgCache = new Map()

    let zoom = 0.2
    let panX = 0
    let panY = 0
    let isDragging  = false
    let didDrag     = false
    let lastMouseX  = 0
    let lastMouseY  = 0
    let hoveredCell: { row: number; col: number } | null = null
    let lastPinchDist = 0
    let maxTouches  = 0   // highest touch count in the current gesture
    let initted     = false

    // Rubber-band zoom state
    let zoomBox: { x0: number; y0: number; x1: number; y1: number } | null = null

    // ── helpers ────────────────────────────────────────────────────────────

    const getCell = (r: number, c: number) =>
      cellsRef.current.get(`${r}:${c}`) ?? null

    const wrap = (n: number, max: number) => ((n % max) + max) % max

    const screenToCell = (sx: number, sy: number) => {
      const cellW = CELL_SIZE * zoom
      const col = Math.floor((sx - panX) / cellW)
      const row = Math.floor((sy - panY) / cellW)
      return { row: wrap(row, ROWS), col: wrap(col, COLS) }
    }

    // ── draw ───────────────────────────────────────────────────────────────

    const draw = () => {
      const ctx = canvas.getContext('2d')!
      const W = canvas.width
      const H = canvas.height
      if (W === 0 || H === 0) return

      ctx.clearRect(0, 0, W, H)

      const cellW = CELL_SIZE * zoom
      if (cellW < 0.5) return

      const colStart = Math.floor(-panX / cellW)
      const rowStart = Math.floor(-panY / cellW)
      const colEnd   = Math.ceil((W - panX) / cellW)
      const rowEnd   = Math.ceil((H - panY) / cellW)

      for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = colStart; col <= colEnd; col++) {
          const realRow = wrap(row, ROWS)
          const realCol = wrap(col, COLS)
          const sx = Math.floor(col * cellW + panX)
          const sy = Math.floor(row * cellW + panY)
          const sw = Math.ceil(cellW)
          const cell    = getCell(realRow, realCol)
          const hovered = hoveredCell?.row === realRow && hoveredCell?.col === realCol

          drawCell(ctx, {
            x: sx, y: sy, size: sw,
            bgColor: cell ? (cell.bgColor || '#ffffff') : (hovered ? '#dde8ff' : '#eef0f5'),
            contentText: cell?.contentText,
            imageUrl:    cell?.imageUrl,
            imgCache, onImageLoad: draw,
            hovered, claimed: !!cell,
          })
        }
      }

      // Cell-number labels at higher zoom (unclaimed cells only)
      if (cellW > 28) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        const fs = Math.max(7, Math.min(cellW * 0.11, 10))
        ctx.font         = `${fs}px monospace`
        ctx.textAlign    = 'left'
        ctx.textBaseline = 'top'
        for (let row = rowStart; row <= rowEnd; row++) {
          for (let col = colStart; col <= colEnd; col++) {
            const rr = wrap(row, ROWS), rc = wrap(col, COLS)
            if (!getCell(rr, rc)) {
              const sx = col * cellW + panX
              const sy = row * cellW + panY
              ctx.fillText(`#${rr * COLS + rc + 1}`, sx + 2, sy + 2)
            }
          }
        }
      }

      // Rubber-band zoom rectangle
      if (zoomBox && zoomModeRef.current) {
        const bx = Math.min(zoomBox.x0, zoomBox.x1)
        const by = Math.min(zoomBox.y0, zoomBox.y1)
        const bw = Math.abs(zoomBox.x1 - zoomBox.x0)
        const bh = Math.abs(zoomBox.y1 - zoomBox.y0)
        ctx.save()
        ctx.fillStyle   = 'rgba(59,130,246,0.08)'
        ctx.fillRect(bx, by, bw, bh)
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth   = 1.5
        ctx.setLineDash([5, 3])
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1)
        ctx.restore()
      }
    }

    drawRef.current = draw

    // ── resize ─────────────────────────────────────────────────────────────

    const minZoom = () => MIN_CELL_PX / CELL_SIZE

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      if (!initted && canvas.width > 0 && canvas.height > 0) {
        initted = true
        zoom = minZoom()
        panX = 0
        panY = 0
      }
      zoom = Math.max(zoom, minZoom())
      draw()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // ── zoom helpers ───────────────────────────────────────────────────────

    const applyZoom = (factor: number, cx: number, cy: number) => {
      const newZoom = Math.max(minZoom(), Math.min(MAX_ZOOM, zoom * factor))
      panX = cx - (cx - panX) * (newZoom / zoom)
      panY = cy - (cy - panY) * (newZoom / zoom)
      zoom = newZoom
      draw()
    }

    zoomInRef.current  = () => applyZoom(1.5,     canvas.width / 2, canvas.height / 2)
    zoomOutRef.current = () => applyZoom(1 / 1.5, canvas.width / 2, canvas.height / 2)
    homeRef.current    = () => { zoom = minZoom(); panX = 0; panY = 0; draw() }

    // ── mouse ──────────────────────────────────────────────────────────────

    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      isDragging = true
      didDrag    = false
      if (zoomModeRef.current) {
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        zoomBox = { x0: sx, y0: sy, x1: sx, y1: sy }
      } else {
        lastMouseX = e.clientX
        lastMouseY = e.clientY
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      if (isDragging) {
        if (zoomModeRef.current && zoomBox) {
          zoomBox = { ...zoomBox, x1: sx, y1: sy }
          if (Math.abs(zoomBox.x1 - zoomBox.x0) > 4 || Math.abs(zoomBox.y1 - zoomBox.y0) > 4) didDrag = true
        } else if (!zoomModeRef.current) {
          const dx = e.clientX - lastMouseX
          const dy = e.clientY - lastMouseY
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag = true
          panX += dx
          panY += dy
          lastMouseX = e.clientX
          lastMouseY = e.clientY
        }
      }

      hoveredCell = zoomModeRef.current ? null : screenToCell(sx, sy)
      draw()
    }

    const onMouseUp = (e: MouseEvent) => {
      if (zoomModeRef.current && zoomBox && didDrag) {
        // Zoom to the rubber-band rectangle
        const bx = Math.min(zoomBox.x0, zoomBox.x1)
        const by = Math.min(zoomBox.y0, zoomBox.y1)
        const bw = Math.abs(zoomBox.x1 - zoomBox.x0)
        const bh = Math.abs(zoomBox.y1 - zoomBox.y0)
        if (bw > 16 && bh > 16) {
          const factor  = Math.min(canvas.width / bw, canvas.height / bh)
          const newZoom = Math.max(minZoom(), Math.min(MAX_ZOOM, zoom * factor))
          const cx = bx + bw / 2, cy = by + bh / 2
          panX = canvas.width  / 2 - (cx - panX) * (newZoom / zoom)
          panY = canvas.height / 2 - (cy - panY) * (newZoom / zoom)
          zoom = newZoom
        }
      } else if (!didDrag && !zoomModeRef.current) {
        // Clean click — open the cell modal
        const rect = canvas.getBoundingClientRect()
        const hit = screenToCell(e.clientX - rect.left, e.clientY - rect.top)
        if (hit) onClickRef.current(hit.row, hit.col, getCell(hit.row, hit.col))
      }
      zoomBox    = null
      isDragging = false
      draw()
    }

    const onMouseLeave = () => {
      isDragging  = false
      hoveredCell = null
      zoomBox     = null
      draw()
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        const rect = canvas.getBoundingClientRect()
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        panX -= e.deltaX
        panY -= e.deltaY
        draw()
      }
    }

    // ── touch ──────────────────────────────────────────────────────────────

    const touchDist = (a: Touch, b: Touch) => {
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      maxTouches = Math.max(maxTouches, e.touches.length)

      if (e.touches.length === 1 && maxTouches === 1) {
        // Fresh single-finger touch — start pan tracking
        isDragging = true
        didDrag    = false
        lastMouseX = e.touches[0].clientX
        lastMouseY = e.touches[0].clientY
      } else if (e.touches.length >= 2) {
        isDragging    = false
        lastPinchDist = touchDist(e.touches[0], e.touches[1])
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMouseX
        const dy = e.touches[0].clientY - lastMouseY
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag = true
        panX += dx
        panY += dy
        lastMouseX = e.touches[0].clientX
        lastMouseY = e.touches[0].clientY
        draw()
      } else if (e.touches.length >= 2) {
        const rect = canvas.getBoundingClientRect()
        const dist = touchDist(e.touches[0], e.touches[1])
        const cx   = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const cy   = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        applyZoom(dist / lastPinchDist, cx, cy)
        lastPinchDist = dist
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault()

      // Dropping from 2 fingers → 1: restart pan tracking for the remaining finger
      if (e.touches.length === 1) {
        isDragging = true
        didDrag    = false   // ensures this residual finger-lift can't trigger a click
        lastMouseX = e.touches[0].clientX
        lastMouseY = e.touches[0].clientY
      }

      // Fire click only if the entire gesture was a clean single tap
      if (maxTouches === 1 && !didDrag && e.touches.length === 0) {
        const rect = canvas.getBoundingClientRect()
        const sx = e.changedTouches[0].clientX - rect.left
        const sy = e.changedTouches[0].clientY - rect.top
        const hit = screenToCell(sx, sy)
        if (hit) onClickRef.current(hit.row, hit.col, getCell(hit.row, hit.col))
      }

      if (e.touches.length === 0) {
        isDragging = false
        didDrag    = false
        maxTouches = 0   // reset for next gesture
      }
    }

    // ── go-to-cell (called from App) ───────────────────────────────────────
    if (goToCellRef) {
      goToCellRef.current = (row: number, col: number) => {
        const cellW = CELL_SIZE * zoom
        panX = canvas.width  / 2 - (col + 0.5) * cellW
        panY = canvas.height / 2 - (row + 0.5) * cellW
        draw()
      }
    }

    canvas.addEventListener('mousedown',  onMouseDown)
    canvas.addEventListener('mousemove',  onMouseMove)
    canvas.addEventListener('mouseup',    onMouseUp)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('wheel',      onWheel,      { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false })
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false })

    return () => {
      ro.disconnect()
      drawRef.current    = null
      zoomInRef.current  = () => {}
      zoomOutRef.current = () => {}
      homeRef.current    = () => {}
      if (goToCellRef) goToCellRef.current = null
      canvas.removeEventListener('mousedown',  onMouseDown)
      canvas.removeEventListener('mousemove',  onMouseMove)
      canvas.removeEventListener('mouseup',    onMouseUp)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('wheel',      onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove',  onTouchMove)
      canvas.removeEventListener('touchend',   onTouchEnd)
    }
  }, []) // runs once; reads live data via refs

  // Only show controls on pointer-fine devices (mouse/trackpad, not touchscreen)
  const isPointerFine = window.matchMedia('(pointer: fine)').matches

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block', width: '100%', height: '100%',
          cursor: zoomMode ? 'crosshair' : 'default',
          touchAction: 'none',
        }}
      />

      {/* Desktop zoom controls — bottom-left */}
      {isPointerFine && (
        <div style={{
          position: 'absolute', bottom: '14px', left: '14px',
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'rgba(255,255,255,0.92)',
          border: '1.5px solid rgba(0,0,0,0.10)',
          borderRadius: '10px', padding: '3px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}>
          {/* Rubber-band zoom toggle */}
          <CtrlBtn
            onClick={() => setZoomMode(z => !z)}
            title="Drag to zoom into an area"
            active={zoomMode}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="2"/>
              <path d="M13 13L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M8.5 6V11M6 8.5H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </CtrlBtn>

          <div style={{ width: '1px', background: 'rgba(0,0,0,0.08)', alignSelf: 'stretch', margin: '3px 1px' }} />

          {/* Zoom in */}
          <CtrlBtn onClick={() => zoomInRef.current()} title="Zoom in">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </CtrlBtn>

          {/* Zoom out */}
          <CtrlBtn onClick={() => zoomOutRef.current()} title="Zoom out">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </CtrlBtn>

          <div style={{ width: '1px', background: 'rgba(0,0,0,0.08)', alignSelf: 'stretch', margin: '3px 1px' }} />

          {/* Home / reset */}
          <CtrlBtn onClick={() => homeRef.current()} title="Reset view">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M3 9L10 3L17 9V17H13V12H7V17H3V9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </CtrlBtn>
        </div>
      )}
    </div>
  )
}
