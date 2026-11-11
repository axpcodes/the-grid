/**
 * Single source of truth for how a cell looks.
 * Used by the grid (rendered once into cached bitmaps) and the modal previews.
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
}

/** Relative luminance (0 = black, 1 = white) of a #rgb / #rrggbb colour. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 1
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** Returns the loaded image, kicking off a load (and calling onLoad) if needed. */
export function getImage(cache: ImgCache, url: string, onLoad?: () => void): HTMLImageElement | null {
  const entry = cache.get(url)
  if (entry && entry !== 'loading' && entry !== 'error') return entry
  if (!entry) {
    cache.set(url, 'loading')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => { cache.set(url, img); onLoad?.() }
    img.onerror = () => { cache.set(url, 'error') }
    img.src = url
  }
  return null
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
  const { x, y, size, bgColor, contentText, imageUrl, imgCache, onImageLoad } = opts

  // ── background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = bgColor
  ctx.fillRect(x, y, size, size)

  // ── image (cover-cropped to the square, never stretched) ────────────────────
  const img = imageUrl && imgCache ? getImage(imgCache, imageUrl, onImageLoad) : null
  if (img) {
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth  - side) / 2
    const sy = (img.naturalHeight - side) / 2
    ctx.drawImage(img, sx, sy, side, side, x, y, size, size)
  }

  // ── text (fully in screen-space — scales perfectly with zoom) ────────────────
  if (contentText && size > 4) {
    const pad = size * 0.06
    const S   = size - pad * 2   // usable square in screen px
    const N   = contentText.length

    // squareFit: makes short text big and prominent (fills the cell nicely)
    const squareFit  = S / Math.sqrt(N * CHAR_W_RATIO * LINE_H_RATIO)
    // naturalSize: floor that targets ~32 chars/line — long text clips at the
    // bottom (zoom in / open the cell to read it all) instead of becoming dust
    const naturalSize = S / (32 * CHAR_W_RATIO)
    let fontSize     = Math.min(size * 0.18, Math.max(size * 0.03, squareFit, naturalSize))

    // squareFit assumes perfect packing; word-wrap wastes space. Shrink until the
    // wrapped text actually fits — but never below the long-text readability floor.
    const floor = Math.max(size * 0.03, naturalSize)
    for (let i = 0; i < 12 && fontSize > floor; i++) {
      ctx.font = `${fontSize}px ${FONT}`
      if (wrapText(ctx, contentText, S).length * fontSize * LINE_H_RATIO <= S) break
      fontSize = Math.max(floor, fontSize * 0.9)
    }

    ctx.save()

    // Legibility: text over a photo gets a scrim; otherwise pick ink by background.
    let ink = luminance(bgColor) < 0.32 ? 'rgba(255,255,255,0.92)' : 'rgba(20,17,14,0.86)'
    if (img) {
      ctx.fillStyle = 'rgba(15,12,10,0.42)'
      ctx.fillRect(x, y, size, size)
      ink = 'rgba(255,255,255,0.95)'
    }

    ctx.beginPath()
    ctx.rect(x + pad, y + pad, S, S)
    ctx.clip()

    ctx.font = `${fontSize}px ${FONT}`
    const lines      = wrapText(ctx, contentText, S)
    const lineHeight = fontSize * LINE_H_RATIO

    // Only scale to prevent horizontal overflow; vertical overflow is clipped
    const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width))
    const scale    = Math.min(1, S / maxLineW)
    const ffs      = fontSize * scale
    const flh      = lineHeight * scale

    ctx.font         = `${ffs}px ${FONT}`
    ctx.fillStyle    = ink
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'

    const cx     = x + size / 2
    const totalH = lines.length * flh
    // Center vertically when text fits; top-align when it overflows so the
    // beginning of the text is always visible
    const startY = totalH <= S
      ? y + size / 2 - totalH / 2 + ffs / 2
      : y + pad + ffs / 2

    for (let i = 0; i < lines.length; i++) {
      const lineY = startY + i * flh
      if (lineY - flh > y + size) break  // rest is below the cell
      ctx.fillText(lines[i], cx, lineY)
    }

    ctx.restore()
  }
}
