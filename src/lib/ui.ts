/** Shared design tokens — warm paper, ink, one vermilion accent. */
import type { CSSProperties } from 'react'

export const INK       = '#1a1714'
export const INK_SOFT  = '#5b544b'
export const INK_FAINT = '#9a9185'
export const PAPER     = '#f3efe6'   // the wall: unclaimed cells
export const SURFACE   = '#fffdf8'   // sheets & cards
export const LINE      = 'rgba(60,45,25,0.12)'
export const ACCENT    = '#e2553b'   // selection, pulses
export const SERIF     = `'Instrument Serif', Georgia, 'Times New Roman', serif`

export const isTouch = () => window.matchMedia('(pointer: coarse)').matches

export const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  minHeight: 48, padding: '0 20px', borderRadius: 999, border: 'none',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  transition: 'transform .12s ease, opacity .15s ease, background .15s ease',
}
export const btnPrimary: CSSProperties = { ...btn, background: INK, color: SURFACE }
export const btnGhost: CSSProperties   = { ...btn, background: 'rgba(26,23,20,0.06)', color: INK }

export const cellNumber = (row: number, col: number, cols: number) => row * cols + col + 1
