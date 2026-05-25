/**
 * Single source of truth for how a cell looks.
 * Used by both the grid canvas and the modal preview canvas.
 * Everything is in screen-space pixels — no zoom transforms.
 */

const FONT = `'JetBrains Mono', 'Fira Code', monospace`
const CHAR_W_RATIO = 0.60   // monospace avg char width / font size
const LINE_H_RATIO = 1.30

export type ImgCache = Map<string, HTMLImageElement | 'loading' | 'error'>

export interface DrawCellOpts {
  x: number
  y: number
  size: number           // cell width = cell height (square)
  bgColor: string
  contentText?: string
  imageUrl?: string
  imgCache?: ImgCache
  onImageLoad?: () => void
  hovered?: boolean
  claimed?: boolean
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text]
}

export function drawCell(ctx: CanvasRenderingContext2D, opts: DrawCellOpts) {
  const { x, y, size, bgColor, contentText, imageUrl, imgCache, onImageLoad, hovered, claimed } = opts

  // ── background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = bgColor
  ctx.fillRect(x, y, size, size)

  // ── image ────────────────────────────────────────────────────────────────────
  if (imageUrl && imgCache) {
    const entry = imgCache.get(imageUrl)
    if (!entry) {
      imgCache.set(imageUrl, 'loading')
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload  = () => { imgCache.set(imageUrl, img); onImageLoad?.() }
      img.onerror = () => { imgCache.set(imageUrl, 'error') }
      img.src = imageUrl
    } else if (entry !== 'loading' && entry !== 'error') {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, size, size)
      ctx.clip()
      ctx.drawImage(entry, x, y, size, size)
      ctx.restore()
    }
  }

  // ── text (fully in screen-space — scales perfectly with zoom) ────────────────
  if (contentText && size > 4) {
    const pad  = size * 0.06
    const S    = size - pad * 2   // usable square in screen px

    // Font size that fills a square block for this text length
    const N         = contentText.length
    const squareFit = S / Math.sqrt(N * CHAR_W_RATIO * LINE_H_RATIO)
    const fontSize  = Math.min(size * 0.18, Math.max(size * 0.04, squareFit))

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + pad, y + pad, S, S)
    ctx.clip()

    ctx.font = `${fontSize}px ${FONT}`
    const lines      = wrapText(ctx, contentText, S)
    const lineHeight = fontSize * LINE_H_RATIO
    const totalH     = lines.length * lineHeight
    const maxLineW   = Math.max(...lines.map(l => ctx.measureText(l).width))

    // Safety scale-down if still overflows
    const scale   = Math.min(1, S / totalH, S / maxLineW)
    const ffs     = fontSize * scale
    const flh     = lineHeight * scale

    ctx.font           = `${ffs}px ${FONT}`
    ctx.fillStyle      = 'rgba(0,0,0,0.82)'
    ctx.textAlign      = 'center'
    ctx.textBaseline   = 'middle'

    const cx     = x + size / 2
    const cy     = y + size / 2
    const startY = cy - ((lines.length - 1) / 2) * flh
    lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * flh))

    ctx.restore()
  }

  // ── border ───────────────────────────────────────────────────────────────────
  if (hovered) {
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth   = 2
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)
  } else if (size > 1) {
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'
    ctx.lineWidth   = 0.5
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
  }

  // ── claimed dot ──────────────────────────────────────────────────────────────
  if (claimed && size > 10) {
    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    ctx.arc(x + size - 4, y + 4, Math.min(3, size * 0.05), 0, Math.PI * 2)
    ctx.fill()
  }
}
