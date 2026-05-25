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
  const lines: string[] = []
  // Respect explicit newlines (paragraph breaks) first
  for (const para of text.split('\n')) {
    if (!para) { lines.push(''); continue }
    const words = para.split(' ')
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
    lines.push(cur)
  }
  return lines.length ? lines : ['']
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
    const pad = size * 0.06
    const S   = size - pad * 2   // usable square in screen px

    const N = contentText.length

    // squareFit: makes short text big and prominent (fills the cell nicely)
    const squareFit  = S / Math.sqrt(N * CHAR_W_RATIO * LINE_H_RATIO)
    // naturalSize: floor that targets ~32 chars/line — prevents text from becoming
    // an unreadable micro-block for long content; text clips at the bottom instead
    const naturalSize = S / (32 * CHAR_W_RATIO)
    const fontSize   = Math.min(size * 0.18, Math.max(size * 0.03, squareFit, naturalSize))

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + pad, y + pad, S, S)
    ctx.clip()

    ctx.font = `${fontSize}px ${FONT}`
    const lines      = wrapText(ctx, contentText, S)
    const lineHeight = fontSize * LINE_H_RATIO

    // Only scale to prevent horizontal overflow; vertical overflow is fine — the
    // clip rect handles it, and users can zoom in to read more of the cell
    const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width))
    const scale    = Math.min(1, S / maxLineW)
    const ffs      = fontSize * scale
    const flh      = lineHeight * scale

    ctx.font         = `${ffs}px ${FONT}`
    ctx.fillStyle    = 'rgba(0,0,0,0.82)'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'

    const cx     = x + size / 2
    const totalH = lines.length * flh
    // Center vertically when text fits; top-align when it overflows so the
    // beginning of the text is always visible
    const startY = totalH <= S
      ? y + size / 2 - totalH / 2 + ffs / 2
      : y + pad + ffs / 2

    lines.forEach((line, i) => {
      const lineY = startY + i * flh
      if (lineY - flh > y + size) return  // skip fully off-screen lines
      ctx.fillText(line, cx, lineY)
    })

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
