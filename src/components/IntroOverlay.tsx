import { useEffect, useRef, useState } from 'react'
import { SERIF } from '../lib/ui'

const STORAGE_KEY = 'grid-intro-seen'

export type IntroAction = 'explore' | 'claim'

interface Props {
  onDone: (action: IntroAction) => void
  /** Real number of claimed cells, if known — shown as quiet social proof. */
  claimedCount?: number
}

// ── timeline (seconds) ───────────────────────────────────────────────────────
const PULL_START = 1.45   // camera starts pulling back
const PULL_END   = 4.1    // whole wall revealed
const TEXT_AT    = 2.35   // headline starts rising in
const END        = 4.6    // last frame we need to animate

const BG = '#0d0b09'
const PALETTE = [
  '#e2553b', '#f2b84b', '#f3c9b8', '#fbf4e6', '#6aa38b', '#c9dbef',
  '#2f6f8f', '#d98c5f', '#8d5a97', '#f6e7b9', '#b84a3a', '#9cc5a1',
]

/** Deterministic per-cell randomness, so the wall looks the same every time. */
function hash(r: number, c: number, salt = 0) {
  let h = (Math.imul(r, 374761393) + Math.imul(c, 668265263) + Math.imul(salt, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const easeOut   = (t: number) => 1 - (1 - t) ** 3
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const clamp01   = (t: number) => Math.max(0, Math.min(1, t))

/** When does cell (r,c) light up? Infinity = stays dark. Busier near the middle. */
function igniteAt(r: number, c: number): number {
  const d = Math.sqrt(r * r + c * c)
  const density = 0.035 + 0.6 * Math.exp(-(d * d) / 22)
  if (hash(r, c) > density) return Infinity
  if (d < 6.5) return 0.18 + d * 0.15 + hash(r, c, 7) * 0.32    // the first people, one by one
  return 1.2 + hash(r, c, 3) * 1.6                                // everyone else, as we pull back
}

export function IntroOverlay({ onDone, claimedCount }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [leaving, setLeaving] = useState(false)
  const [ready, setReady] = useState(false)   // CTAs are tappable
  const reduce = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches).current

  const finish = (action: IntroAction) => {
    if (leaving) return
    localStorage.setItem(STORAGE_KEY, '1')
    setLeaving(true)
    window.setTimeout(() => onDone(action), reduce ? 0 : 520)
  }

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), reduce ? 0 : (TEXT_AT + 1.5) * 1000)
    return () => window.clearTimeout(t)
  }, [reduce])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let W = 0, H = 0, dpr = 1, raf = 0
    const t0 = performance.now()

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)

      const S0 = Math.max(34, Math.min(64, Math.min(W, H) / 8.5))   // first-frame cell size
      const S1 = W < 700 ? 2.6 : 3.2                                 // fully revealed
      const settle = 1.12 - 0.12 * easeOut(clamp01(t / PULL_START))
      const pull = easeInOut(clamp01((t - PULL_START) / (PULL_END - PULL_START)))
      const s = S0 * settle * Math.exp(Math.log(S1 / S0) * pull)
      const gap = s > 10 ? s * 0.07 : 0

      // Centre of cell (0,0) sits slightly above the middle, leaving room for words
      const ox = W / 2 - s / 2
      const oy = H * 0.42 - s / 2
      const c0 = Math.floor(-ox / s) - 1, c1 = Math.ceil((W - ox) / s)
      const r0 = Math.floor(-oy / s) - 1, r1 = Math.ceil((H - oy) / s)

      // Empty cells: faint squares while big enough to read as a grid
      if (s >= 6) {
        ctx.fillStyle = `rgba(255,244,228,${0.045 * clamp01((s - 6) / 10)})`
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++)
            ctx.fillRect(ox + c * s + gap / 2, oy + r * s + gap / 2, s - gap, s - gap)
      }

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const at = igniteAt(r, c)
          if (t < at) continue
          const age = t - at
          const a = clamp01(age / 0.35)
          const pop = s > 10 ? 0.55 + 0.45 * easeOut(clamp01(age / 0.4)) : 1
          const size = (s - gap) * pop
          const x = ox + c * s + (s - size) / 2
          const y = oy + r * s + (s - size) / 2
          const col = PALETTE[Math.floor(hash(r, c, 11) * PALETTE.length)]

          ctx.globalAlpha = a
          // A brief glow as each one is placed
          if (s > 10 && age < 0.6) {
            ctx.shadowColor = col
            ctx.shadowBlur = 24 * (1 - age / 0.6)
          }
          ctx.fillStyle = col
          ctx.fillRect(x, y, Math.max(1, size), Math.max(1, size))
          ctx.shadowBlur = 0

          // Up close, hint at what's inside: a few lines of words, or a picture
          if (size > 22) {
            const ink = col === '#fbf4e6' || col === '#f6e7b9' || col === '#f3c9b8' || col === '#c9dbef'
              ? 'rgba(26,23,20,0.55)' : 'rgba(255,250,240,0.6)'
            ctx.fillStyle = ink
            const p = size * 0.16
            if (hash(r, c, 5) < 0.62) {
              const lines = 2 + Math.floor(hash(r, c, 9) * 3)
              for (let i = 0; i < lines; i++) {
                const w = (size - p * 2) * (0.45 + hash(r, c, 20 + i) * 0.55)
                ctx.fillRect(x + p, y + p + i * size * 0.15, w, Math.max(1, size * 0.055))
              }
            } else {
              ctx.beginPath()
              ctx.arc(x + size * 0.36, y + size * 0.36, size * 0.11, 0, Math.PI * 2)
              ctx.fill()
              ctx.beginPath()
              ctx.moveTo(x + p * 0.6, y + size - p * 0.6)
              ctx.lineTo(x + size * 0.45, y + size * 0.52)
              ctx.lineTo(x + size * 0.62, y + size * 0.68)
              ctx.lineTo(x + size * 0.75, y + size * 0.58)
              ctx.lineTo(x + size - p * 0.6, y + size - p * 0.6)
              ctx.closePath()
              ctx.fill()
            }
          }
        }
      }
      ctx.globalAlpha = 1

      // Vignette, heavier at the bottom where the words sit
      const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.18, W / 2, H * 0.5, Math.max(W, H) * 0.75)
      g.addColorStop(0, 'rgba(13,11,9,0)')
      g.addColorStop(1, 'rgba(13,11,9,0.88)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      const b = ctx.createLinearGradient(0, H * 0.48, 0, H)
      b.addColorStop(0, 'rgba(13,11,9,0)')
      b.addColorStop(0.45, 'rgba(13,11,9,0.78)')
      b.addColorStop(1, 'rgba(13,11,9,0.96)')
      ctx.fillStyle = b
      ctx.fillRect(0, H * 0.48, W, H * 0.52)
    }

    const frame = () => {
      const t = reduce ? END : (performance.now() - t0) / 1000
      draw(t)
      raf = t < END ? requestAnimationFrame(frame) : 0
    }

    const resize = () => {
      W = canvas.clientWidth
      H = canvas.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      if (!raf) draw(reduce ? END : Math.min(END, (performance.now() - t0) / 1000))
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    raf = requestAnimationFrame(frame)
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [reduce])

  // Letter-by-letter rise for the headline
  const title = 'humanity’s last mural.'
  const delay = (s: number) => (reduce ? '0s' : `${s}s`)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: BG, overflow: 'hidden',
        opacity: leaving ? 0 : 1, transition: 'opacity .5s ease',
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      <button
        onClick={() => finish('explore')}
        style={{
          position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: 14, zIndex: 2,
          minHeight: 44, padding: '0 16px', borderRadius: 999,
          background: 'rgba(255,248,236,0.07)', border: '1px solid rgba(255,248,236,0.12)',
          color: 'rgba(255,248,236,0.6)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        Skip
      </button>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1,
        padding: '0 24px calc(max(6vh, 28px) + env(safe-area-inset-bottom))',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'rgba(255,248,236,0.5)', marginBottom: 14,
            animation: `fade-in .8s ease ${delay(TEXT_AT - 0.2)} both`,
          }}>
            The Grid · 1,000,000 squares
          </div>

          <h1
            aria-label={title}
            style={{
              fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, color: '#fbf4e6',
              fontSize: 'clamp(46px, 11vw, 92px)', lineHeight: 0.95, letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {title.split(' ').map((word, w, words) => {
              // Letters animate individually, but each word stays unbreakable
              const offset = words.slice(0, w).join(' ').length + (w ? 1 : 0)
              return (
                <span key={w} aria-hidden="true" style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                  {[...word].map((ch, i) => (
                    <span key={i} style={{
                      display: 'inline-block',
                      animation: `rise .9s cubic-bezier(.2,.8,.2,1) ${delay(TEXT_AT + (offset + i) * 0.035)} both`,
                    }}>
                      {ch}
                    </span>
                  ))}
                  {w < words.length - 1 && '\u00a0'}
                </span>
              )
            })}
          </h1>

          <p style={{
            marginTop: 18, maxWidth: 440, fontSize: 'clamp(14px, 3.6vw, 16px)', lineHeight: 1.6,
            color: 'rgba(255,248,236,0.68)',
            animation: `fade-up .9s ease ${delay(TEXT_AT + 0.9)} both`,
          }}>
            One square each. Leave words or a picture — made by a person, not generated.
            Once it’s up, it can’t be changed.
            {claimedCount ? <> <span style={{ color: '#fbf4e6' }}>{claimedCount.toLocaleString()} people</span> already have.</> : null}
          </p>

          <div style={{
            display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap', maxWidth: 420,
            animation: `fade-up .8s ease ${delay(TEXT_AT + 1.3)} both`,
            pointerEvents: ready ? 'auto' : 'none',
          }}>
            <button onClick={() => finish('claim')} style={{
              flex: '1 1 auto', minHeight: 52, padding: '0 18px', borderRadius: 999, border: 'none',
              background: '#fbf4e6', color: '#1a1714', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
              cursor: 'pointer',
            }}>
              Leave your mark
            </button>
            <button onClick={() => finish('explore')} style={{
              flex: '1 1 auto', minHeight: 52, padding: '0 18px', borderRadius: 999,
              background: 'transparent', border: '1px solid rgba(255,248,236,0.22)',
              color: '#fbf4e6', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}>
              Look around
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function shouldShowIntro(): boolean {
  try { return !localStorage.getItem(STORAGE_KEY) } catch { return true }
}
