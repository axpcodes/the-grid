import { useState, useEffect, useRef, useCallback } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { CellData } from '../types'
import { rowToCell } from '../types'
import { drawCell } from '../lib/renderCell'
import type { ImgCache } from '../lib/renderCell'
import { COLS } from './GridCanvas'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)

const PREVIEW_SIZE = 260  // canvas side length in CSS/device-independent px

interface Props {
  row: number
  col: number
  cell: CellData | null
  onClose: () => void
  onClaimed: (cell: CellData) => void
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  border: '1.5px solid #e2e8f0', borderRadius: '8px',
  fontSize: '14px', outline: 'none', background: '#fafafa',
  boxSizing: 'border-box', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  display: 'block', fontWeight: 700, fontSize: '11px',
  marginBottom: '5px', color: '#374151',
  textTransform: 'uppercase', letterSpacing: '0.07em',
}
const btnPrimary: React.CSSProperties = {
  background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
  border: 'none', borderRadius: '10px', padding: '12px 16px',
  fontSize: '14px', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit',
}
const btnSecondary: React.CSSProperties = {
  background: '#f3f4f6', color: '#374151', border: 'none',
  borderRadius: '10px', padding: '12px 16px', fontSize: '14px',
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

// ── Step progress bar ──────────────────────────────────────────────────────────
function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '5px', marginBottom: '24px' }}>
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <div key={n} style={{
          height: '3px', flex: n === step ? 2 : 1, borderRadius: '2px',
          background: n === step ? '#3b82f6' : n < step ? '#93c5fd' : '#e2e8f0',
          transition: 'all 0.3s ease',
        }} />
      ))}
    </div>
  )
}

// ── Image resize helper (client-side, no storage needed) ─────────────────────
function resizeImage(file: File, maxPx = 512, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = url
  })
}

// ── Canvas preview — pixel-identical to the grid at any zoom ──────────────────
function CellCanvas({
  bgColor, imageUrl, contentText, size = PREVIEW_SIZE,
}: {
  bgColor: string; imageUrl: string; contentText: string; size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCacheRef = useRef<ImgCache>(new Map())

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    drawCell(ctx, {
      x: 0, y: 0, size,
      bgColor: bgColor || '#ffffff',
      contentText: contentText || undefined,
      imageUrl: imageUrl || undefined,
      imgCache: imgCacheRef.current,
      onImageLoad: redraw,
      claimed: !!(contentText || imageUrl || bgColor !== '#ffffff'),
    })
  }, [bgColor, imageUrl, contentText, size])

  useEffect(() => { redraw() }, [redraw])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{
        width: `${size}px`, height: `${size}px`,
        borderRadius: '14px',
        border: '2px solid rgba(0,0,0,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        display: 'block',
      }}
    />
  )
}

// ── Stripe payment form ────────────────────────────────────────────────────────
function PaymentForm({ row, col, formData, onSuccess, onBack }: {
  row: number
  col: number
  formData: { ownerName: string; contentText: string; imageUrl: string; contact: string; bgColor: string }
  onSuccess: (cell: CellData) => void
  onBack: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  const handlePay = async () => {
    if (!stripe || !elements) return
    setPaying(true)
    setError('')

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.')
      setPaying(false)
      return
    }

    if (paymentIntent?.status !== 'succeeded') {
      setError('Payment incomplete. Please try again.')
      setPaying(false)
      return
    }

    try {
      const res = await fetch('/api/confirm-cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to claim cell')

      const cell = rowToCell({
        id: `${row}:${col}`,
        row_idx: row, col_idx: col,
        owner_name:   formData.ownerName,
        content_text: formData.contentText,
        image_url:    formData.imageUrl,
        contact:      formData.contact,
        bg_color:     formData.bgColor,
        claimed_at:   new Date().toISOString(),
      })
      onSuccess(cell)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setPaying(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <PaymentElement options={{ layout: { type: 'tabs', defaultCollapsed: false } }} />
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#dc2626' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onBack} disabled={paying} style={btnSecondary}>← Back</button>
        <button
          onClick={handlePay}
          disabled={paying || !stripe || !elements}
          style={{
            ...btnPrimary, flex: 1,
            background: paying ? '#9ca3af' : 'linear-gradient(135deg, #16a34a, #15803d)',
            cursor: paying ? 'not-allowed' : 'pointer',
          }}
        >
          {paying ? 'Processing…' : 'Pay $1 · place my mark'}
        </button>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function ClaimModal({ row, col, cell, onClose, onClaimed }: Props) {
  const [step, setStep]               = useState(1)
  const [ownerName,    setOwnerName]  = useState('')
  const [contentText,  setContentText] = useState('')
  const [bgColor,      setBgColor]    = useState('#ffffff')
  const [imageUrl,     setImageUrl]   = useState('')
  const [contact,      setContact]    = useState('')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [piError,      setPiError]    = useState('')
  const [couponInput,  setCouponInput]  = useState('')
  const [couponError,  setCouponError]  = useState('')
  const [couponBusy,   setCouponBusy]   = useState(false)

  const cellNum = row * COLS + col + 1

  // Create PaymentIntent when step 3 opens
  useEffect(() => {
    if (step !== 3 || clientSecret) return
    setPiError('')
    fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, col, ownerName, contentText, imageUrl, contact, bgColor }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setClientSecret(data.clientSecret)
      })
      .catch(err => {
        setPiError(err.message ?? 'Could not initialise payment. Try again.')
        setStep(2)
      })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCouponClaim = async () => {
    const code = couponInput.trim()
    if (!code) { setCouponError('Enter a coupon code.'); return }
    setCouponBusy(true)
    setCouponError('')
    try {
      const res = await fetch('/api/coupon-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponCode: code, row, col, ownerName, contentText, imageUrl, contact, bgColor }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.')
      onClaimed(rowToCell({
        id: `${row}:${col}`, row_idx: row, col_idx: col,
        owner_name: ownerName, content_text: contentText,
        image_url: imageUrl, contact, bg_color: bgColor,
        claimed_at: new Date().toISOString(),
      }))
    } catch (err: unknown) {
      setCouponError(err instanceof Error ? err.message : 'Something went wrong.')
      setCouponBusy(false)
    }
  }

  const goNext = () => {
    setStep(s => s + 1)
  }
  const goBack = () => setStep(s => s - 1)
  const handleBackdrop = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  // Two-column layout when viewport is wide enough
  const wide = window.innerWidth >= 640

  return (
    <div onClick={handleBackdrop} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: '16px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        width: '100%',
        maxWidth: cell ? '420px' : step === 1 ? '740px' : '480px',
        maxHeight: '92dvh', overflowY: 'auto',
        boxShadow: '0 32px 80px rgba(0,0,0,0.30)',
        transition: 'max-width 0.3s ease',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '22px 24px 0',
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Cell #{cellNum.toLocaleString()}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#111827', margin: '2px 0 0' }}>
              {cell
                ? 'This cell is taken'
                : step === 1 ? 'Leave your mark'
                : step === 2 ? 'One last look'
                : 'Place your mark'}
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: '#f3f4f6', border: 'none', borderRadius: '50%',
            width: '34px', height: '34px', cursor: 'pointer', fontSize: '20px', lineHeight: 1,
            color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ padding: '18px 24px 24px' }}>

          {/* ── Already claimed ── */}
          {cell ? (
            <div>
              <div style={{ height: '1px', background: '#f3f4f6', margin: '14px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%',
                  background: cell.bgColor || '#e2e8f0', border: '2px solid #e2e8f0', flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>{cell.ownerName || 'Anonymous'}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    {new Date(cell.claimedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>
              {cell.imageUrl && (
                <img src={cell.imageUrl} alt="" style={{ width: '100%', borderRadius: '10px', marginBottom: '12px', objectFit: 'cover', maxHeight: '200px' }} />
              )}
              {cell.contentText && (
                <p style={{ color: '#374151', lineHeight: 1.6, fontSize: '15px', marginBottom: '10px' }}>{cell.contentText}</p>
              )}
              {cell.contact && (
                <a href={cell.contact.startsWith('http') ? cell.contact : `https://${cell.contact}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '13px', color: '#3b82f6', wordBreak: 'break-all' }}>
                  {cell.contact}
                </a>
              )}
              {!cell.contentText && !cell.imageUrl && !cell.contact && (
                <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '14px' }}>No content added.</p>
              )}
            </div>

          ) : (
            /* ── Claim flow ── */
            <>
              <StepBar step={step} total={3} />

              {/* ────────────────────────────────────────────────────────────
                  Step 1 — Design your cell (two-column on desktop)
              ──────────────────────────────────────────────────────────── */}
              {step === 1 && (
                <div style={{
                  display: 'flex',
                  flexDirection: wide ? 'row' : 'column',
                  gap: wide ? '32px' : '20px',
                  alignItems: wide ? 'flex-start' : 'stretch',
                }}>

                  {/* Left: live canvas preview */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                    flexShrink: 0,
                    width: wide ? `${PREVIEW_SIZE}px` : '100%',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <CellCanvas bgColor={bgColor} imageUrl={imageUrl} contentText={contentText} size={PREVIEW_SIZE} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                      live preview
                    </div>
                    {/* Color swatch row for quick picks */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
                      {['#ffffff', '#111827', '#fef9c3', '#dbeafe', '#dcfce7', '#fce7f3', '#f3f4f6', '#fde68a'].map(c => (
                        <button key={c} onClick={() => setBgColor(c)} style={{
                          width: '22px', height: '22px', borderRadius: '6px', background: c,
                          border: bgColor === c ? '2px solid #3b82f6' : '1.5px solid rgba(0,0,0,0.12)',
                          cursor: 'pointer', padding: 0,
                        }} />
                      ))}
                      {/* Custom color picker */}
                      <label style={{ position: 'relative', width: '22px', height: '22px', cursor: 'pointer' }}>
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '6px',
                          background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                          border: '1.5px solid rgba(0,0,0,0.12)',
                        }} />
                        <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                      </label>
                    </div>
                  </div>

                  {/* Right: form */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '13px', minWidth: 0 }}>
                    <div>
                      <label style={lbl}>
                        Your name{' '}
                        <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <input
                        value={ownerName}
                        onChange={e => setOwnerName(e.target.value)}
                        placeholder="Anonymous"
                        maxLength={40} autoFocus
                        style={inp}
                      />
                    </div>

                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '-6px' }}>
                      Leave it blank to post anonymously.
                    </div>

                    <div>
                      <label style={lbl}>
                        Message{' '}
                        <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <textarea
                        value={contentText}
                        onChange={e => setContentText(e.target.value)}
                        placeholder="Leave something for the world…"
                        maxLength={200} rows={3}
                        style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
                      />
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px', textAlign: 'right' }}>
                        {contentText.length}/200
                      </div>
                    </div>

                    <div>
                      <label style={lbl}>
                        Background image{' '}
                        <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* File upload button */}
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          padding: '0 12px', height: '38px', borderRadius: '8px',
                          border: '1.5px solid #e2e8f0', background: '#fafafa',
                          cursor: 'pointer', fontSize: '13px', color: '#374151',
                          flexShrink: 0, whiteSpace: 'nowrap', boxSizing: 'border-box',
                        }}>
                          <input
                            type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={async e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              try { setImageUrl(await resizeImage(file)) } catch { /* ignore */ }
                              e.target.value = ''  // reset so same file can be re-selected
                            }}
                          />
                          ↑ Upload
                        </label>
                        {/* URL paste fallback — hidden when a data URL is loaded */}
                        {!imageUrl.startsWith('data:') && (
                          <input
                            value={imageUrl}
                            onChange={e => setImageUrl(e.target.value)}
                            placeholder="or paste a URL…"
                            style={{ ...inp, flex: 1 }}
                          />
                        )}
                        {/* Thumbnail + remove when image is loaded */}
                        {imageUrl && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0 }}>
                            <img
                              src={imageUrl} alt=""
                              style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0', flexShrink: 0 }}
                              onError={() => setImageUrl('')}
                            />
                            <span style={{ fontSize: '11px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {imageUrl.startsWith('data:') ? 'Image uploaded ✓' : imageUrl}
                            </span>
                            <button
                              onClick={() => setImageUrl('')}
                              style={{ fontSize: '13px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                            >×</button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label style={lbl}>
                        Your link{' '}
                        <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <input
                        value={contact}
                        onChange={e => setContact(e.target.value)}
                        placeholder="website, @handle, email…"
                        maxLength={100} style={inp}
                      />
                    </div>

                    <button onClick={goNext} style={{ ...btnPrimary, marginTop: '6px' }}>
                      Preview my cell →
                    </button>
                  </div>
                </div>
              )}

              {/* ────────────────────────────────────────────────────────────
                  Step 2 — Preview + confirm
              ──────────────────────────────────────────────────────────── */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Big preview */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <CellCanvas bgColor={bgColor} imageUrl={imageUrl} contentText={contentText} size={300} />
                      <div style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                        exactly what it will look like, forever
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ fontSize: '12px', color: '#374151' }}><strong>Name:</strong> {ownerName || 'Anonymous'}</div>
                    {contentText && <div style={{ fontSize: '12px', color: '#374151' }}><strong>Message:</strong> {contentText}</div>}
                    {contact && <div style={{ fontSize: '12px', color: '#374151' }}><strong>Link:</strong> {contact}</div>}
                    {imageUrl && <div style={{ fontSize: '12px', color: '#374151' }}><strong>Image:</strong> ✓</div>}
                  </div>

                  {/* Permanence warning */}
                  <div style={{
                    background: '#fffbeb', border: '1px solid #fbbf24',
                    borderRadius: '12px', padding: '14px 16px',
                    fontSize: '13px', color: '#92400e', lineHeight: 1.55,
                  }}>
                    ⚠️ <strong>This is permanent.</strong> Once placed, your mark cannot be edited or removed — even by us. Think of it as a brushstroke on a shared canvas.
                  </div>

                  {piError && (
                    <div style={{ color: '#dc2626', fontSize: '13px' }}>{piError}</div>
                  )}

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={goBack} style={btnSecondary}>← Edit</button>
                    <button onClick={goNext} style={{
                      ...btnPrimary, flex: 1,
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                    }}>
                      Lock the cell · $1 →
                    </button>
                  </div>
                </div>
              )}

              {/* ────────────────────────────────────────────────────────────
                  Step 3 — Payment
              ──────────────────────────────────────────────────────────── */}
              {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {/* Stripe payment */}
                  {!clientSecret ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280', fontSize: '14px' }}>
                      Preparing payment…
                    </div>
                  ) : (
                    <Elements stripe={stripePromise} options={{
                      clientSecret,
                      fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap' }],
                      appearance: {
                        theme: 'stripe',
                        variables: {
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSizeBase: '13px',
                          colorPrimary: '#111827',
                          colorBackground: '#f9fafb',
                          borderRadius: '7px',
                          spacingUnit: '4px',
                          spacingGridRow: '12px',
                        },
                        rules: {
                          '.Input': { padding: '8px 10px', border: '1.5px solid #e2e8f0' },
                          '.Input:focus': { border: '1.5px solid #111827', boxShadow: 'none' },
                          '.Tab': { padding: '8px 12px', fontSize: '12px' },
                          '.TabLabel': { fontWeight: '600' },
                        },
                      },
                    }}>
                      <PaymentForm
                        row={row} col={col}
                        formData={{ ownerName, contentText, imageUrl, contact, bgColor }}
                        onSuccess={onClaimed}
                        onBack={goBack}
                      />
                    </Elements>
                  )}

                  {/* ── Coupon code alternative ── */}
                  <div style={{
                    borderTop: '1px solid #f3f4f6',
                    marginTop: '20px', paddingTop: '16px',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                  }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', letterSpacing: '0.04em' }}>
                      — or use a coupon code —
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        value={couponInput}
                        onChange={e => { setCouponInput(e.target.value); setCouponError('') }}
                        onKeyDown={e => e.key === 'Enter' && handleCouponClaim()}
                        placeholder="Coupon code"
                        disabled={couponBusy}
                        style={{ ...inp, flex: 1 }}
                      />
                      <button
                        onClick={handleCouponClaim}
                        disabled={couponBusy || !couponInput.trim()}
                        style={{
                          ...btnPrimary, width: 'auto', padding: '9px 16px',
                          background: couponBusy ? '#9ca3af' : '#111827',
                          cursor: couponBusy ? 'not-allowed' : 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {couponBusy ? '…' : 'Claim →'}
                      </button>
                    </div>
                    {couponError && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#dc2626' }}>
                        {couponError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
