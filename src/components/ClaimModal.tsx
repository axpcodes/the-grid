import { useState, useEffect, useRef, useCallback } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { CellData } from '../types'
import { rowToCell } from '../types'
import { drawCell } from '../lib/renderCell'
import type { ImgCache } from '../lib/renderCell'
import { COLS } from './GridCanvas'
import { Turnstile } from './Turnstile'
import {
  INK, INK_SOFT, INK_FAINT, SURFACE, LINE, ACCENT, SERIF,
  btnPrimary, btnGhost, isTouch, cellNumber,
} from '../lib/ui'

interface Props {
  row: number
  col: number
  cell: CellData | null
  onClose: () => void
  onClaimed: (cell: CellData) => void
  onShare: (row: number, col: number) => void
  onAbout: () => void
}

const SWATCHES = ['#ffffff', '#1a1714', '#f6e7b9', '#f3c9b8', '#cfe3d4', '#c9dbef', '#e2553b', '#2f4a7a']
const MAX_TEXT = 3000

// ── helpers ──────────────────────────────────────────────────────────────────
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return narrow
}

/** Center-crop to a square and shrink to 512px — cells are square, never stretched. */
function resizeImage(file: File, maxPx = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const out  = Math.min(maxPx, side)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = out
      canvas.getContext('2d')!.drawImage(
        img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out,
      )
      let data = canvas.toDataURL('image/jpeg', 0.84)
      if (data.length > 260_000) data = canvas.toDataURL('image/jpeg', 0.7)
      resolve(data)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')) }
    img.src = url
  })
}

function linkFor(contact: string): string | null {
  const c = contact.trim()
  if (/^https?:\/\//i.test(c)) return c
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(c)) return `https://${c}`
  return null   // @handles and free text are shown, not linked
}

// ── Canvas preview — pixel-identical to the grid ─────────────────────────────
function CellCanvas({ bgColor, imageUrl, contentText, size }: {
  bgColor: string; imageUrl: string; contentText: string; size: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cache = useRef<ImgCache>(new Map())

  const redraw = useCallback(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawCell(ctx, {
      x: 0, y: 0, size,
      bgColor: bgColor || '#ffffff',
      contentText: contentText || undefined,
      imageUrl: imageUrl || undefined,
      imgCache: cache.current,
      onImageLoad: redraw,
    })
  }, [bgColor, imageUrl, contentText, size])

  useEffect(() => { redraw() }, [redraw])

  return (
    <canvas
      ref={ref}
      style={{
        width: size, height: size, display: 'block', borderRadius: 4,
        boxShadow: '0 1px 0 rgba(60,45,25,0.08), 0 14px 40px rgba(60,45,25,0.18)',
      }}
    />
  )
}

// ── Sheet: bottom sheet on phones, card on desktop ───────────────────────────
function Sheet({ narrow, maxWidth, onBackdrop, header, footer, children }: {
  narrow: boolean; maxWidth: number; onBackdrop: () => void
  header: ReactNode; footer?: ReactNode; children: ReactNode
}) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onBackdrop() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(20,16,12,0.48)', animation: 'fade-in .18s ease both',
        display: 'flex', justifyContent: 'center',
        alignItems: narrow ? 'flex-end' : 'center',
        padding: narrow ? 0 : 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: SURFACE, width: '100%', maxWidth,
          maxHeight: narrow ? '94dvh' : '90dvh',
          borderRadius: narrow ? '22px 22px 0 0' : 22,
          boxShadow: '0 30px 80px rgba(20,16,12,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: narrow ? 'sheet-up .32s cubic-bezier(.2,.9,.25,1) both' : 'pop-in .22s ease both',
        }}
      >
        {narrow && <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(26,23,20,0.16)', margin: '9px auto 0' }} />}
        {header}
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 22px 18px', flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: '12px 22px', paddingBottom: narrow ? 'calc(14px + env(safe-area-inset-bottom))' : 18,
            borderTop: `1px solid ${LINE}`, background: SURFACE,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function Header({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 22px 10px' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: INK_FAINT, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {eyebrow}
        </div>
        <h2 style={{
          fontFamily: SERIF, fontWeight: 400, fontSize: 30, lineHeight: 1.05, color: INK,
          letterSpacing: '-0.01em', marginTop: 4, overflowWrap: 'anywhere',
        }}>
          {title}
        </h2>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 40, height: 40, flexShrink: 0, borderRadius: 999, border: 'none',
          background: 'rgba(26,23,20,0.06)', color: INK_SOFT, fontSize: 22, lineHeight: 1,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
    </div>
  )
}

const label: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: INK_SOFT,
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7,
}
const field: CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: `1.5px solid ${LINE}`, background: '#fff', color: INK,
  fontFamily: 'inherit', fontSize: 16, outline: 'none',
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function ClaimModal({ row, col, cell, onClose, onClaimed, onShare, onAbout }: Props) {
  const narrow  = useNarrow()
  const cellNum = cellNumber(row, col, COLS)

  // ── Viewing a claimed cell ─────────────────────────────────────────────────
  useEffect(() => {
    if (!cell) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cell, onClose])

  if (cell) {
    const size = Math.min(narrow ? window.innerWidth - 44 : 360, 360)
    const href = cell.contact ? linkFor(cell.contact) : null
    return (
      <Sheet
        narrow={narrow} maxWidth={440} onBackdrop={onClose}
        header={<Header eyebrow={`Cell #${cellNum.toLocaleString()}`} title={cell.ownerName || 'Anonymous'} onClose={onClose} />}
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onShare(row, col)} style={{ ...btnPrimary, flex: 1 }}>Share this cell</button>
            <button onClick={onClose} style={{ ...btnGhost, flex: '0 0 auto' }}>Close</button>
          </div>
        }
      >
        <div style={{ fontSize: 13, color: INK_FAINT, marginBottom: 16 }}>
          Left {new Date(cell.claimedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <CellCanvas bgColor={cell.bgColor} imageUrl={cell.imageUrl} contentText={cell.contentText} size={size} />
        </div>
        {cell.contentText && cell.contentText.length > 110 && (
          <p style={{ color: INK, fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 14 }}>
            {cell.contentText}
          </p>
        )}
        {cell.contact && (
          <div style={{ fontSize: 14, marginBottom: 6, overflowWrap: 'anywhere' }}>
            {href
              ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" style={{ color: ACCENT }}>{cell.contact}</a>
              : <span style={{ color: INK_SOFT }}>{cell.contact}</span>}
          </div>
        )}
        <button onClick={onAbout} style={{
          marginTop: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, color: INK_FAINT, textDecoration: 'underline', textUnderlineOffset: 3,
        }}>
          What is this place?
        </button>
      </Sheet>
    )
  }

  return <ClaimFlow {...{ row, col, cellNum, narrow, onClose, onClaimed }} />
}

// ── Claim flow: compose → lock ───────────────────────────────────────────────
function ClaimFlow({ row, col, cellNum, narrow, onClose, onClaimed }: {
  row: number; col: number; cellNum: number; narrow: boolean
  onClose: () => void; onClaimed: (cell: CellData) => void
}) {
  const [step, setStep]               = useState<1 | 2>(1)
  const [contentText, setContentText] = useState('')
  const [imageUrl, setImageUrl]       = useState('')
  const [bgColor, setBgColor]         = useState('#ffffff')
  const [ownerName, setOwnerName]     = useState('')
  const [contact, setContact]         = useState('')
  const [showSign, setShowSign]       = useState(false)
  const [imgError, setImgError]       = useState('')

  const [token, setToken]           = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const [pending, setPending]       = useState(false)
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState('')
  const [confirmClose, setConfirmClose] = useState(false)

  const hasContent = !!(contentText.trim() || imageUrl)
  const dirty = hasContent || !!ownerName || !!contact || bgColor !== '#ffffff'
  const tryClose = useCallback(() => { if (dirty) setConfirmClose(true); else onClose() }, [dirty, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryClose])

  const submit = useCallback(async (tok: string) => {
    setBusy(true)
    setError('')
    const abort = new AbortController()
    const timer = window.setTimeout(() => abort.abort(), 25_000)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captchaToken: tok, row, col, ownerName, contentText, imageUrl, contact, bgColor }),
        signal: abort.signal,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong. Try again.')
      onClaimed(rowToCell({
        id: `${row}:${col}`, row_idx: row, col_idx: col,
        owner_name: ownerName.trim(), content_text: contentText.trim(),
        image_url: imageUrl, contact: contact.trim(), bg_color: bgColor,
        claimed_at: new Date().toISOString(),
      }))
    } catch (err) {
      setError(abort.signal.aborted
        ? 'That took too long — your square wasn’t saved. Please try again.'
        : err instanceof Error ? err.message : 'Something went wrong. Try again.')
      setToken('')
      setCaptchaKey(k => k + 1)   // tokens are single-use: fetch a fresh one
      setBusy(false)
    } finally {
      window.clearTimeout(timer)
    }
  }, [row, col, ownerName, contentText, imageUrl, contact, bgColor, onClaimed])

  // If they hit "Lock it in" before the background check finished, finish it for them
  useEffect(() => {
    if (pending && token && !busy) { setPending(false); void submit(token) }
  }, [pending, token, busy, submit])

  const lock = () => {
    if (busy || pending) return
    if (token) void submit(token)
    else { setError(''); setPending(true) }
  }

  const onFile = async (file?: File) => {
    if (!file) return
    setImgError('')
    try { setImageUrl(await resizeImage(file)) }
    catch { setImgError('That file couldn’t be read as an image.') }
  }

  const preview = narrow ? Math.min(window.innerWidth - 44, step === 1 ? 240 : 300) : (step === 1 ? 250 : 300)

  const footer = (
    <>
      {/* Mounted for the whole flow so the check finishes while they write */}
      <Turnstile
        key={captchaKey}
        onVerify={setToken}
        onError={msg => { setError(msg); setPending(false) }}
      />
      {error && (
        <div role="alert" style={{
          background: '#fdecea', color: '#a5321f', borderRadius: 12,
          padding: '10px 12px', fontSize: 13, lineHeight: 1.45, margin: '4px 0 10px',
        }}>
          {error}
        </div>
      )}
      {step === 1 ? (
        <button
          onClick={() => setStep(2)}
          disabled={!hasContent}
          style={{ ...btnPrimary, width: '100%', opacity: hasContent ? 1 : 0.35, cursor: hasContent ? 'pointer' : 'not-allowed' }}
        >
          {hasContent ? 'Preview →' : 'Write something or add a photo'}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setStep(1)} disabled={busy} style={{ ...btnGhost, flex: '0 0 auto' }}>Edit</button>
          <button onClick={lock} disabled={busy} style={{ ...btnPrimary, flex: 1, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Locking it in…' : pending ? 'Checking you’re human…' : 'Lock it in forever'}
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      <Sheet
        narrow={narrow} maxWidth={step === 1 ? 720 : 460} onBackdrop={tryClose}
        header={
          <Header
            eyebrow={`Cell #${cellNum.toLocaleString()} · step ${step} of 2`}
            title={step === 1 ? 'Make it yours' : 'Lock it in'}
            onClose={tryClose}
          />
        }
        footer={footer}
      >
        {step === 1 ? (
          <div style={{
            display: 'flex', flexDirection: narrow ? 'column' : 'row',
            gap: narrow ? 18 : 28, alignItems: narrow ? 'stretch' : 'flex-start', paddingTop: 6,
          }}>
            {/* Preview + colour */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <CellCanvas bgColor={bgColor} imageUrl={imageUrl} contentText={contentText} size={preview} />
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center', maxWidth: narrow ? '100%' : preview + 20 }}>
                {SWATCHES.map(c => (
                  <button
                    key={c}
                    onClick={() => setBgColor(c)}
                    aria-label={`Background ${c}`}
                    style={{
                      width: 30, height: 30, borderRadius: 999, background: c, padding: 0, cursor: 'pointer',
                      border: bgColor === c ? `2.5px solid ${ACCENT}` : `1.5px solid rgba(26,23,20,0.16)`,
                      boxShadow: bgColor === c ? `0 0 0 2px ${SURFACE} inset` : 'none',
                    }}
                  />
                ))}
                <label aria-label="Custom colour" style={{ position: 'relative', width: 30, height: 30, cursor: 'pointer' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 999,
                    background: 'conic-gradient(#e2553b, #f2b84b, #6aa38b, #3c7a89, #2f4a7a, #8d5a97, #e2553b)',
                    border: '1.5px solid rgba(26,23,20,0.16)',
                  }} />
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                </label>
              </div>
            </div>

            {/* Words + photo */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={label} htmlFor="cell-text">Your words</label>
                <textarea
                  id="cell-text"
                  value={contentText}
                  onChange={e => setContentText(e.target.value)}
                  placeholder="Something only you would say…"
                  maxLength={MAX_TEXT}
                  rows={narrow ? 4 : 6}
                  autoFocus={!isTouch()}
                  style={{ ...field, resize: 'vertical', lineHeight: 1.5, minHeight: 110 }}
                />
                {contentText.length > MAX_TEXT * 0.8 && (
                  <div style={{ fontSize: 11, color: INK_FAINT, textAlign: 'right', marginTop: 4 }}>
                    {contentText.length}/{MAX_TEXT}
                  </div>
                )}
              </div>

              <div>
                <span style={label}>A photo</span>
                {imageUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={imageUrl} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover' }} />
                    <span style={{ fontSize: 13, color: INK_SOFT, flex: 1 }}>Added — cropped to a square.</span>
                    <button onClick={() => setImageUrl('')} style={{ ...btnGhost, minHeight: 40, fontSize: 13, padding: '0 14px' }}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <label style={{
                    ...btnGhost, width: '100%', borderRadius: 12, border: `1.5px dashed rgba(26,23,20,0.2)`,
                    background: 'transparent', fontWeight: 600, fontSize: 14,
                  }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
                      <circle cx="7.5" cy="8.5" r="1.5" fill="currentColor" />
                      <path d="M3 14l4.5-4 3.5 3 2.5-2 3.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                    Add a photo you took or made
                  </label>
                )}
                {imgError && <div style={{ fontSize: 12, color: '#a5321f', marginTop: 6 }}>{imgError}</div>}
              </div>

              {showSign ? (
                <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={label} htmlFor="cell-name">Signed</label>
                    <input id="cell-name" value={ownerName} onChange={e => setOwnerName(e.target.value)}
                      placeholder="Anonymous" maxLength={40} style={field} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={label} htmlFor="cell-link">Link</label>
                    <input id="cell-link" value={contact} onChange={e => setContact(e.target.value)}
                      placeholder="site, @handle, email" maxLength={100} style={field}
                      autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowSign(true)} style={{
                  alignSelf: 'flex-start', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, color: INK_SOFT, textDecoration: 'underline', textUnderlineOffset: 3,
                }}>
                  + Sign it (optional)
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, paddingTop: 6 }}>
            <CellCanvas bgColor={bgColor} imageUrl={imageUrl} contentText={contentText} size={preview} />
            <div style={{ fontSize: 13, color: INK_SOFT }}>
              Signed <strong style={{ color: INK }}>{ownerName.trim() || 'Anonymous'}</strong>
              {contact.trim() && <> · {contact.trim()}</>}
            </div>
            <div style={{
              width: '100%', background: 'rgba(226,85,59,0.07)', border: '1px solid rgba(226,85,59,0.22)',
              borderRadius: 14, padding: '14px 16px', fontSize: 14, lineHeight: 1.55, color: INK,
            }}>
              <strong>This is permanent.</strong> Once it’s locked, no one can edit it — including you.
              Keep it human: made by you, not generated.
              <div style={{ fontSize: 12, color: INK_FAINT, marginTop: 6 }}>
                We only remove content that’s illegal or abusive.
              </div>
            </div>
            <div style={{ fontSize: 12, color: INK_FAINT, textAlign: 'center' }}>
              Free. No account. A quiet human check runs in the background.
            </div>
          </div>
        )}
      </Sheet>

      {confirmClose && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,16,12,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'fade-in .15s ease both',
        }}>
          <div style={{
            background: SURFACE, borderRadius: 20, padding: 22, width: '100%', maxWidth: 330,
            boxShadow: '0 20px 60px rgba(20,16,12,0.3)', animation: 'pop-in .2s ease both',
          }}>
            <div style={{ fontFamily: SERIF, fontSize: 26, color: INK, marginBottom: 6 }}>Discard this?</div>
            <div style={{ fontSize: 14, color: INK_SOFT, marginBottom: 18, lineHeight: 1.5 }}>
              What you’ve written won’t be saved.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClose(false)} style={{ ...btnGhost, flex: 1 }}>Keep going</button>
              <button onClick={onClose} style={{ ...btnPrimary, flex: 1, background: '#a5321f' }}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
