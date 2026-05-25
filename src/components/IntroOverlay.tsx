import { useState } from 'react'

const STORAGE_KEY = 'grid-intro-seen'

interface Props {
  onDone: () => void
}

// ── Low-fi SVG illustrations ───────────────────────────────────────────────────

// Slide 1: mosaic of colorful cells — communicates "shared canvas"
function MosaicIllustration() {
  const S = 26, G = 5
  // [col, row, color | null]
  const cells: [number, number, string | null][] = [
    [0,0,'#3b82f6'], [1,0,null],        [2,0,'#f59e0b'], [3,0,null],        [4,0,'#ec4899'],
    [0,1,null],       [1,1,'#22c55e'],  [2,1,null],       [3,1,'#8b5cf6'],  [4,1,null],
    [0,2,'#f43f5e'], [1,2,null],        [2,2,null],        [3,2,'#06b6d4'], [4,2,null],
    [0,3,null],       [1,3,'#f59e0b'], [2,3,'#3b82f6'],  [3,3,null],        [4,3,'#22c55e'],
    [0,4,null],       [1,4,null],       [2,4,'#8b5cf6'],  [3,4,null],        [4,4,null],
  ]
  const dim = 5 * S + 4 * G
  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
      {cells.map(([c, r, color]) => {
        const x = c * (S + G), y = r * (S + G)
        return (
          <g key={`${c}-${r}`}>
            <rect x={x} y={y} width={S} height={S} rx={4}
              fill={color ?? 'rgba(255,255,255,0.06)'}
              stroke={color ? 'none' : 'rgba(255,255,255,0.09)'}
              strokeWidth={1}
            />
            {color && (
              <>
                <rect x={x+4} y={y+8}  width={S-8}  height={2} rx={1} fill="rgba(255,255,255,0.5)"/>
                <rect x={x+4} y={y+13} width={S-13} height={2} rx={1} fill="rgba(255,255,255,0.3)"/>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Slide 2: single highlighted cell with content — communicates "make it yours"
function ClaimIllustration() {
  return (
    <svg width="148" height="148" viewBox="0 0 148 148">
      {/* Outer glow ring */}
      <rect x="4" y="4" width="140" height="140" rx="16" fill="rgba(59,130,246,0.12)"/>
      {/* Cell body */}
      <rect x="12" y="12" width="124" height="124" rx="12" fill="#1e2a3a" stroke="#3b82f6" strokeWidth="2.5"/>
      {/* A splash of color — user's background */}
      <rect x="12" y="12" width="124" height="44" rx="12" fill="#f59e0b" opacity="0.8"/>
      <rect x="12" y="44" width="124" height="12" fill="#f59e0b" opacity="0.8"/>
      {/* Text lines */}
      <rect x="24" y="70"  width="60" height="3" rx="1.5" fill="rgba(255,255,255,0.35)"/>
      <rect x="24" y="79"  width="80" height="3" rx="1.5" fill="rgba(255,255,255,0.25)"/>
      <rect x="24" y="88"  width="50" height="3" rx="1.5" fill="rgba(255,255,255,0.25)"/>
      <rect x="24" y="97"  width="68" height="3" rx="1.5" fill="rgba(255,255,255,0.25)"/>
      <rect x="24" y="106" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.25)"/>
      {/* Claimed dot */}
      <circle cx="124" cy="24" r="6" fill="#22c55e"/>
    </svg>
  )
}

// Slide 3: grid with magnifier focus — communicates "explore"
function ExploreIllustration() {
  const S = 22, G = 4
  const cells: [number, number, string | null][] = [
    [0,0,'#3b82f6'], [1,0,null],       [2,0,'#f59e0b'], [3,0,null],       [4,0,'#ec4899'],
    [0,1,null],       [1,1,'#22c55e'],[2,1,'#8b5cf6'],  [3,1,'#06b6d4'], [4,1,null],
    [0,2,'#f43f5e'], [1,2,'#3b82f6'],[2,2,'#f59e0b'],   [3,2,'#22c55e'], [4,2,'#f43f5e'],
    [0,3,null],       [1,3,'#8b5cf6'],[2,3,null],        [3,3,'#f59e0b'], [4,3,null],
    [0,4,null],       [1,4,null],      [2,4,'#3b82f6'],  [3,4,null],       [4,4,'#22c55e'],
  ]
  const dim = 5 * S + 4 * G

  // Magnifier centers on cell (2,2) — the middle
  const focusCol = 2, focusRow = 2
  const fx = focusCol * (S + G) + S / 2
  const fy = focusRow * (S + G) + S / 2
  const radius = S * 1.5

  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
      <defs>
        <clipPath id="lens">
          <circle cx={fx} cy={fy} r={radius}/>
        </clipPath>
      </defs>

      {/* Dim base grid */}
      {cells.map(([c, r, color]) => {
        const x = c * (S + G), y = r * (S + G)
        return (
          <rect key={`${c}-${r}`} x={x} y={y} width={S} height={S} rx={3}
            fill={color ?? 'rgba(255,255,255,0.04)'}
            opacity={0.3}
          />
        )
      })}

      {/* Bright cells inside the magnifier */}
      {cells.map(([c, r, color]) => {
        const x = c * (S + G), y = r * (S + G)
        return (
          <rect key={`lens-${c}-${r}`} x={x} y={y} width={S} height={S} rx={3}
            fill={color ?? 'rgba(255,255,255,0.06)'}
            clipPath="url(#lens)"
          />
        )
      })}

      {/* Magnifier ring */}
      <circle cx={fx} cy={fy} r={radius}
        fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5"/>

      {/* Magnifier handle */}
      <line
        x1={fx + radius * 0.65} y1={fy + radius * 0.65}
        x2={fx + radius * 1.3}  y2={fy + radius * 1.3}
        stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" strokeLinecap="round"
      />
    </svg>
  )
}

// ── Slide data ─────────────────────────────────────────────────────────────────

const slides = [
  {
    illustration: <MosaicIllustration />,
    headline: 'Welcome to The Grid.',
    body: 'Part experiment, part time capsule — a digital mosaic built one cell at a time, by anyone.',
  },
  {
    illustration: <ClaimIllustration />,
    headline: 'Claim a cell. Make it yours.',
    body: 'Add an image, write a poem, leave a note for someone. Whatever you want. It stays there forever.',
  },
  {
    illustration: <ExploreIllustration />,
    headline: 'See what others have left.',
    body: 'Zoom around and discover what people chose to say. Long after the last cell is filled, this place stays.',
  },
]

// ── Component ──────────────────────────────────────────────────────────────────

export function IntroOverlay({ onDone }: Props) {
  const [slide, setSlide] = useState(0)

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    onDone()
  }

  const current = slides[slide]
  const isLast  = slide === slides.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(10,11,18,0.97)',
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
          fontSize: '13px', color: 'rgba(255,255,255,0.28)',
          fontFamily: 'inherit', letterSpacing: '0.04em', padding: '8px 12px',
        }}
      >
        skip
      </button>

      <div style={{
        maxWidth: '440px', width: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', gap: '20px',
      }}>
        {/* Illustration */}
        <div style={{
          display: 'flex', justifyContent: 'flex-start',
          opacity: 0.95,
        }}>
          {current.illustration}
        </div>

        {/* Headline */}
        <div style={{
          fontSize: 'clamp(26px, 6vw, 40px)',
          fontWeight: 800, color: '#fff',
          letterSpacing: '-0.03em', lineHeight: 1.1,
        }}>
          {current.headline}
        </div>

        {/* Body */}
        <div style={{
          fontSize: 'clamp(14px, 2.5vw, 17px)',
          color: 'rgba(255,255,255,0.5)',
          lineHeight: 1.65, marginTop: '-8px',
        }}>
          {current.body}
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              height: '3px',
              width: i === slide ? '24px' : '8px',
              borderRadius: '2px',
              background: i <= slide ? '#3b82f6' : 'rgba(255,255,255,0.14)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* CTAs */}
        {isLast ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={dismiss} style={{
              background: '#3b82f6', color: '#fff', border: 'none',
              borderRadius: '10px', padding: '13px 22px',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '-0.01em',
            }}>
              Start exploring →
            </button>
            <button onClick={dismiss} style={{
              background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.65)',
              border: '1px solid rgba(255,255,255,0.11)',
              borderRadius: '10px', padding: '13px 22px',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Get a cell · $1
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSlide(s => s + 1)}
            style={{
              background: 'rgba(255,255,255,0.07)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.11)',
              borderRadius: '10px', padding: '13px 22px',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
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
