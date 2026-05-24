import { useState } from 'react'
import type { CellData } from '../types'

interface Props {
  row: number
  col: number
  cell: CellData | null
  onClose: () => void
  onSave: (data: Pick<CellData, 'ownerName' | 'contentText' | 'imageUrl' | 'contact' | 'bgColor'>) => void
}

const COLS = 100

const inp: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1.5px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '15px',
  outline: 'none',
  background: '#fafafa',
  boxSizing: 'border-box',
}

const lbl: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: '13px',
  marginBottom: '5px',
  color: '#374151',
}

const cellNum = (row: number, col: number) => row * COLS + col + 1

// ── Step dots ────────────────────────────────────────────────────────────────
function StepDots({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '20px' }}>
      {[1, 2, 3].map(n => (
        <div key={n} style={{
          width: n === step ? '20px' : '8px',
          height: '8px',
          borderRadius: '4px',
          background: n === step ? '#3b82f6' : n < step ? '#93c5fd' : '#e2e8f0',
          transition: 'all 0.25s',
        }} />
      ))}
    </div>
  )
}

// ── Cell preview ─────────────────────────────────────────────────────────────
function CellPreview({ bgColor, imageUrl, contentText }: { bgColor: string; imageUrl: string; contentText: string }) {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '1',
      background: bgColor,
      borderRadius: '12px',
      overflow: 'hidden',
      position: 'relative',
      border: '2px solid #e2e8f0',
      marginBottom: '16px',
    }}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      {contentText && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
          fontSize: '15px',
          color: '#111',
          textAlign: 'center',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          fontWeight: 500,
        }}>
          {contentText}
        </div>
      )}
      {!contentText && !imageUrl && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(0,0,0,0.2)', fontSize: '13px', fontStyle: 'italic',
        }}>
          empty cell
        </div>
      )}
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────
export function ClaimModal({ row, col, cell, onClose, onSave }: Props) {
  const [step, setStep] = useState(1)
  const [ownerName, setOwnerName] = useState('')
  const [contentText, setContentText] = useState('')
  const [bgColor, setBgColor] = useState('#ffffff')
  const [imageUrl, setImageUrl] = useState('')
  const [contact, setContact] = useState('')
  const [nameError, setNameError] = useState('')

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const goNext = () => {
    if (step === 1) {
      if (!ownerName.trim()) { setNameError('Your name is required.'); return }
      setNameError('')
    }
    setStep(s => s + 1)
  }

  const goBack = () => setStep(s => s - 1)

  const handlePlace = () => {
    onSave({ ownerName: ownerName.trim(), contentText: contentText.trim(), imageUrl: imageUrl.trim(), contact: contact.trim(), bgColor })
    onClose()
  }

  const num = cellNum(row, col)

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: '16px',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '24px',
        width: '100%',
        maxWidth: '400px',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Cell #{num}
            </div>
            <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#111827', marginTop: '2px' }}>
              {cell
                ? 'This space is taken'
                : step === 1 ? 'Leave your mark'
                : step === 2 ? 'Leave a trace'
                : 'Ready to place?'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* ── Already claimed — read-only view ── */}
        {cell ? (
          <div>
            <div style={{ height: '1px', background: '#f3f4f6', margin: '16px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: cell.bgColor || '#e2e8f0',
                border: '2px solid #e2e8f0', flexShrink: 0,
              }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>{cell.ownerName}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {new Date(cell.claimedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            </div>
            {cell.imageUrl && (
              <img
                src={cell.imageUrl}
                alt=""
                style={{ width: '100%', borderRadius: '10px', marginBottom: '12px', objectFit: 'cover', maxHeight: '200px' }}
              />
            )}
            {cell.contentText && (
              <p style={{ color: '#374151', lineHeight: 1.6, fontSize: '15px', marginBottom: '10px' }}>{cell.contentText}</p>
            )}
            {cell.contact && (
              <a
                href={cell.contact.startsWith('http') ? cell.contact : `https://${cell.contact}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '13px', color: '#3b82f6', wordBreak: 'break-all' }}
              >
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
            <StepDots step={step} />

            {/* Step 1 — Identity & message */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={lbl}>Your name *</label>
                  <input
                    value={ownerName}
                    onChange={e => { setOwnerName(e.target.value); setNameError('') }}
                    placeholder="What should we call you?"
                    maxLength={40}
                    style={{ ...inp, borderColor: nameError ? '#f87171' : '#e2e8f0' }}
                    autoFocus
                  />
                  {nameError && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{nameError}</div>}
                </div>

                <div>
                  <label style={lbl}>
                    Message <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                  </label>
                  <textarea
                    value={contentText}
                    onChange={e => setContentText(e.target.value)}
                    placeholder="Say something to the world…"
                    maxLength={200}
                    rows={3}
                    style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', textAlign: 'right' }}>
                    {contentText.length}/200
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ ...lbl, marginBottom: 0 }}>Background color</label>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={e => setBgColor(e.target.value)}
                    style={{ width: '44px', height: '36px', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', padding: '2px' }}
                  />
                  <span style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>{bgColor}</span>
                </div>

                <button onClick={goNext} style={btnPrimary}>
                  Next →
                </button>
              </div>
            )}

            {/* Step 2 — Image & contact */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                  Optional — add an image or a link so people can find you.
                </p>

                <div>
                  <label style={lbl}>
                    Image URL <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                  </label>
                  <input
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    style={inp}
                  />
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt="preview"
                      style={{ marginTop: '8px', width: '100%', maxHeight: '130px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      onLoad={e => { (e.target as HTMLImageElement).style.display = 'block' }}
                    />
                  )}
                </div>

                <div>
                  <label style={lbl}>
                    Your link <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                  </label>
                  <input
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                    placeholder="website, @handle, email…"
                    maxLength={100}
                    style={inp}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={goBack} style={btnSecondary}>← Back</button>
                  <button onClick={goNext} style={{ ...btnPrimary, flex: 1 }}>Preview →</button>
                </div>
              </div>
            )}

            {/* Step 3 — Preview & confirm */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <CellPreview bgColor={bgColor} imageUrl={imageUrl} contentText={contentText} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {ownerName && <div style={{ fontSize: '14px', color: '#374151' }}><strong>Name:</strong> {ownerName}</div>}
                  {contact && <div style={{ fontSize: '14px', color: '#374151' }}><strong>Link:</strong> {contact}</div>}
                </div>

                <div style={{
                  background: '#fffbeb',
                  border: '1px solid #fbbf24',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  color: '#92400e',
                  lineHeight: 1.5,
                }}>
                  ⚠️ <strong>This is permanent.</strong> Once placed, your mark cannot be changed or removed — even if you come back. Think of it as graffiti on a digital wall.
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={goBack} style={btnSecondary}>← Back</button>
                  <button onClick={handlePlace} style={{ ...btnPrimary, flex: 1, background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
                    Place my mark
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 16px',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.02em',
  width: '100%',
}

const btnSecondary: React.CSSProperties = {
  background: '#f3f4f6',
  color: '#374151',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 16px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
}
