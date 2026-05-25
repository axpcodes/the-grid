import { useState } from 'react'

const STORAGE_KEY = 'grid-intro-seen'

interface Props {
  onDone: () => void
}

const slides = [
  {
    num: '1,000,000',
    headline: 'One million cells.',
    body: 'Each one permanent. Each one $1. Each one entirely up to you.',
  },
  {
    num: null,
    headline: 'No rules.',
    body: 'Text, color, an image — anything. No moderation, no themes, no undo button. Just a small, permanent piece of the internet.',
  },
  {
    num: null,
    headline: 'It sticks around.',
    body: 'Long after the last cell is filled, this grid stays. Come back in ten years. Explore what a million people chose to say.',
  },
]

export function IntroOverlay({ onDone }: Props) {
  const [slide, setSlide] = useState(0)

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    onDone()
  }

  const current = slides[slide]
  const isLast = slide === slides.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(10, 11, 18, 0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
    }}>

      {/* Skip */}
      <button
        onClick={dismiss}
        style={{
          position: 'absolute', top: '20px', right: '20px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: '13px', color: 'rgba(255,255,255,0.3)',
          fontFamily: 'inherit', letterSpacing: '0.04em',
          padding: '8px 12px',
        }}
      >
        skip
      </button>

      {/* Slide content */}
      <div style={{
        maxWidth: '520px', width: '100%',
        display: 'flex', flexDirection: 'column', gap: '20px',
      }}>

        {/* Big accent number (slide 1 only) */}
        {current.num && (
          <div style={{
            fontSize: 'clamp(48px, 12vw, 88px)',
            fontWeight: 800, color: '#3b82f6',
            letterSpacing: '-0.04em', lineHeight: 1,
            marginBottom: '-8px',
          }}>
            {current.num}
          </div>
        )}

        {/* Headline */}
        <div style={{
          fontSize: 'clamp(32px, 8vw, 56px)',
          fontWeight: 800, color: '#fff',
          letterSpacing: '-0.03em', lineHeight: 1.05,
        }}>
          {current.headline}
        </div>

        {/* Body */}
        <div style={{
          fontSize: 'clamp(15px, 3vw, 18px)',
          color: 'rgba(255,255,255,0.55)',
          lineHeight: 1.6,
          maxWidth: '420px',
        }}>
          {current.body}
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              height: '3px',
              width: i === slide ? '24px' : '8px',
              borderRadius: '2px',
              background: i <= slide ? '#3b82f6' : 'rgba(255,255,255,0.15)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* CTAs */}
        {isLast ? (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button onClick={dismiss} style={{
              background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: '10px', padding: '14px 24px',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '-0.01em',
            }}>
              Start exploring →
            </button>
            <button onClick={dismiss} style={{
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px', padding: '14px 24px',
              fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              Get a cell · $1
            </button>
          </div>
        ) : (
          <button onClick={() => setSlide(s => s + 1)} style={{
            background: 'rgba(255,255,255,0.08)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px', padding: '14px 24px',
            fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', alignSelf: 'flex-start',
            marginTop: '4px',
          }}>
            Next →
          </button>
        )}
      </div>
    </div>
  )
}

export function shouldShowIntro(): boolean {
  return !localStorage.getItem(STORAGE_KEY)
}
