import { useRef, useEffect, useLayoutEffect } from 'react'
import type { CellData } from '../types'
import { drawCell } from '../lib/renderCell'
import type { ImgCache } from '../lib/renderCell'

export const COLS = 1000
export const ROWS = 1000
const CELL_SIZE = 64  // world-space pixels per cell
// Min zoom: cells must be at least MIN_CELL_PX pixels wide on screen
const MIN_CELL_PX = 3
const MAX_ZOOM = 8

interface Props {
  cells: Map<string, CellData>
  onCellClick: (row: number, col: number, data: CellData | null) => void
  goToCellRef?: React.MutableRefObject<((row: number, col: number) => void) | null>
}

export function GridCanvas({ cells, onCellClick, goToCellRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellsRef = useRef(cells)
  const onClickRef = useRef(onCellClick)
  // Keep refs in sync without re-running main effect
  useLayoutEffect(() => { cellsRef.current = cells }, [cells])
  useLayoutEffect(() => { onClickRef.current = onCellClick }, [onCellClick])

  // Exposed so App can trigger a redraw when cells change
  const drawRef = useRef<(() => void) | null>(null)
  useEffect(() => { drawRef.current?.() }, [cells])

  useEffect(() => {
    const canvas = canvasRef.current!
    const imgCache: ImgCache = new Map()
    let zoom = 0.2
    let panX = 0
    let panY = 0
    let isDragging = false
    let didDrag = false
    let lastMouseX = 0
    let lastMouseY = 0
    let hoveredCell: { row: number; col: number } | null = null
    let lastPinchDist = 0
    let initted = false

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

      // Visible range — unclamped for infinite wrapping
      const colStart = Math.floor(-panX / cellW)
      const rowStart = Math.floor(-panY / cellW)
      const colEnd = Math.ceil((W - panX) / cellW)
      const rowEnd = Math.ceil((H - panY) / cellW)

      for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = colStart; col <= colEnd; col++) {
          const realRow = wrap(row, ROWS)
          const realCol = wrap(col, COLS)
          const sx = Math.floor(col * cellW + panX)
          const sy = Math.floor(row * cellW + panY)
          const sw = Math.ceil(cellW)
          const cell = getCell(realRow, realCol)
          const hovered = hoveredCell?.row === realRow && hoveredCell?.col === realCol

          drawCell(ctx, {
            x: sx, y: sy, size: sw,
            bgColor: cell ? (cell.bgColor || '#ffffff') : (hovered ? '#dde8ff' : '#eef0f5'),
            contentText: cell?.contentText,
            imageUrl: cell?.imageUrl,
            imgCache, onImageLoad: draw,
            hovered, claimed: !!cell,
          })
        }
      }

      // ── cell number label at higher zoom (unclaimed cells only) ──
      if (cellW > 28) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        const fs = Math.max(7, Math.min(cellW * 0.11, 10))
        ctx.font = `${fs}px monospace`
        ctx.textAlign = 'left'
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
    }

    drawRef.current = draw

    // ── resize ─────────────────────────────────────────────────────────────

    // Cells must be at least MIN_CELL_PX wide on screen
    const minZoom = () => MIN_CELL_PX / CELL_SIZE

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      if (!initted && canvas.width > 0 && canvas.height > 0) {
        initted = true
        zoom = minZoom() // start fully zoomed out (one grid fills the viewport)
        panX = 0
        panY = 0
      }
      // Clamp zoom in case viewport grew (e.g. rotation on mobile)
      zoom = Math.max(zoom, minZoom())
      draw()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // ── mouse ──────────────────────────────────────────────────────────────

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true
      didDrag = false
      lastMouseX = e.clientX
      lastMouseY = e.clientY
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      if (isDragging) {
        const dx = e.clientX - lastMouseX
        const dy = e.clientY - lastMouseY
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true
        panX += dx
        panY += dy
        lastMouseX = e.clientX
        lastMouseY = e.clientY
      }

      hoveredCell = screenToCell(sx, sy)
      draw()
    }

    const onMouseUp = (e: MouseEvent) => {
      if (!didDrag) {
        const rect = canvas.getBoundingClientRect()
        const hit = screenToCell(e.clientX - rect.left, e.clientY - rect.top)
        if (hit) onClickRef.current(hit.row, hit.col, getCell(hit.row, hit.col))
      }
      isDragging = false
    }

    const onMouseLeave = () => {
      isDragging = false
      hoveredCell = null
      draw()
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        // Pinch-to-zoom (trackpad) or Ctrl+scroll (mouse) → zoom
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        const newZoom = Math.max(minZoom(), Math.min(MAX_ZOOM, zoom * factor))
        panX = mx - (mx - panX) * (newZoom / zoom)
        panY = my - (my - panY) * (newZoom / zoom)
        zoom = newZoom
      } else {
        // Two-finger trackpad scroll (or plain scroll) → pan
        panX -= e.deltaX
        panY -= e.deltaY
      }
      draw()
    }

    // ── touch ──────────────────────────────────────────────────────────────

    const touchDist = (a: Touch, b: Touch) => {
      const dx = a.clientX - b.clientX
      const dy = a.clientY - b.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1) {
        isDragging = true
        didDrag = false
        lastMouseX = e.touches[0].clientX
        lastMouseY = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        isDragging = false
        lastPinchDist = touchDist(e.touches[0], e.touches[1])
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMouseX
        const dy = e.touches[0].clientY - lastMouseY
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true
        panX += dx
        panY += dy
        lastMouseX = e.touches[0].clientX
        lastMouseY = e.touches[0].clientY
        draw()
      } else if (e.touches.length === 2) {
        const rect = canvas.getBoundingClientRect()
        const dist = touchDist(e.touches[0], e.touches[1])
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        const factor = dist / lastPinchDist
        const newZoom = Math.max(minZoom(), Math.min(MAX_ZOOM, zoom * factor))
        panX = cx - (cx - panX) * (newZoom / zoom)
        panY = cy - (cy - panY) * (newZoom / zoom)
        zoom = newZoom
        lastPinchDist = dist
        draw()
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      if (e.changedTouches.length === 1 && !didDrag && e.touches.length === 0) {
        const rect = canvas.getBoundingClientRect()
        const sx = e.changedTouches[0].clientX - rect.left
        const sy = e.changedTouches[0].clientY - rect.top
        const hit = screenToCell(sx, sy)
        if (hit) onClickRef.current(hit.row, hit.col, getCell(hit.row, hit.col))
      }
      if (e.touches.length === 0) { isDragging = false; didDrag = false }
    }

    // ── go-to-cell (called from App) ───────────────────────────────────────
    if (goToCellRef) {
      goToCellRef.current = (row: number, col: number) => {
        const cellW = CELL_SIZE * zoom
        panX = canvas.width / 2 - (col + 0.5) * cellW
        panY = canvas.height / 2 - (row + 0.5) * cellW
        draw()
      }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: false })

    return () => {
      ro.disconnect()
      drawRef.current = null
      if (goToCellRef) goToCellRef.current = null
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, []) // runs once; reads live data via refs

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
