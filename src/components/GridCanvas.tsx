import { useRef, useEffect, useLayoutEffect } from 'react'
import type { CellData } from '../types'

const COLS = 100
const ROWS = 100
const CELL_SIZE = 64 // world-space pixels per cell
// MIN_ZOOM is dynamic — computed from canvas size so the grid always fills the viewport
const MAX_ZOOM = 8

type ImgEntry = HTMLImageElement | 'loading' | 'error'

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
    const imgCache = new Map<string, ImgEntry>()
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

    const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
      const words = text.split(' ')
      const lines: string[] = []
      let current = ''
      for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (ctx.measureText(test).width > maxW && current) {
          lines.push(current)
          current = word
        } else {
          current = test
        }
      }
      if (current) lines.push(current)
      return lines.length ? lines : [text]
    }

    const getCell = (r: number, c: number) =>
      cellsRef.current.get(`${r}:${c}`) ?? null

    const loadImage = (url: string) => {
      if (imgCache.has(url)) return
      imgCache.set(url, 'loading')
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { imgCache.set(url, img); draw() }
      img.onerror = () => { imgCache.set(url, 'error') }
      img.src = url
    }

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
      if (cellW < 0.5) return // too zoomed out to render meaningfully

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
          const sh = Math.ceil(cellW)
          const cell = getCell(realRow, realCol)
          const hovered = hoveredCell?.row === realRow && hoveredCell?.col === realCol

          // ── background ──
          ctx.fillStyle = cell
            ? (cell.bgColor || '#ffffff')
            : hovered ? '#dde8ff' : '#eef0f5'
          ctx.fillRect(sx, sy, sw, sh)

          // ── image ──
          if (cell?.imageUrl) {
            loadImage(cell.imageUrl)
            const cached = imgCache.get(cell.imageUrl)
            if (cached && cached !== 'loading' && cached !== 'error') {
              ctx.save()
              ctx.beginPath()
              ctx.rect(sx, sy, sw, sh)
              ctx.clip()
              ctx.drawImage(cached as HTMLImageElement, sx, sy, sw, sh)
              ctx.restore()
            }
          }

          // ── text (vector: font sized so wrapped block fills cell squarely) ──
          if (cell?.contentText) {
            ctx.save()
            ctx.beginPath()
            ctx.rect(sx + 2, sy + 2, sw - 4, sh - 4)
            ctx.clip()

            const S = CELL_SIZE * 0.94       // target square size in world units
            const LINE_H_RATIO = 1.25
            const CHAR_W_RATIO = 0.55        // avg char width / font size estimate

            // Compute font size that fills a square: derive from text length
            const N = cell.contentText.length
            const squareFit = S / Math.sqrt(N * CHAR_W_RATIO * LINE_H_RATIO)
            // Clamp: don't exceed a comfortable max, don't go invisible
            const baseFontSize = Math.min(CELL_SIZE * 0.18, Math.max(CELL_SIZE * 0.04, squareFit))

            // Wrap at computed size BEFORE zoom transform (world-space units = CSS px)
            ctx.font = `${baseFontSize}px system-ui, sans-serif`
            const lines = wrapText(ctx, cell.contentText, S)
            const lineHeight = baseFontSize * LINE_H_RATIO
            const totalHeight = lines.length * lineHeight
            const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width))

            // Safety scale-down if still overflows (edge cases / tight wrapping)
            const scale = Math.min(1, S / totalHeight, S / maxLineW)
            const finalFontSize = baseFontSize * scale
            const finalLineHeight = lineHeight * scale

            // Draw with zoom transform for true vector scaling
            ctx.translate(sx + sw / 2, sy + sh / 2)
            ctx.scale(zoom, zoom)
            ctx.font = `${finalFontSize}px system-ui, sans-serif`
            ctx.fillStyle = 'rgba(0,0,0,0.82)'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'

            const startY = -(lines.length - 1) / 2 * finalLineHeight
            lines.forEach((line, i) => {
              ctx.fillText(line, 0, startY + i * finalLineHeight)
            })
            ctx.restore()
          }

          // ── border ──
          if (hovered) {
            ctx.strokeStyle = '#3b82f6'
            ctx.lineWidth = 2
            ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2)
          } else {
            ctx.strokeStyle = 'rgba(0,0,0,0.10)'
            ctx.lineWidth = 0.5
            ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1)
          }

          // ── claimed dot ──
          if (cell && sw > 10) {
            ctx.fillStyle = '#22c55e'
            ctx.beginPath()
            ctx.arc(sx + sw - 5, sy + 5, Math.min(3, sw * 0.06), 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // ── coordinates label at higher zoom ──
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
              ctx.fillText(`${rr},${rc}`, sx + 2, sy + 2)
            }
          }
        }
      }
    }

    drawRef.current = draw

    // ── resize ─────────────────────────────────────────────────────────────

    // Grid must fill the viewport — zoom out no further than this
    const minZoom = () => Math.max(
      canvas.width / (COLS * CELL_SIZE),
      canvas.height / (ROWS * CELL_SIZE)
    )

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
