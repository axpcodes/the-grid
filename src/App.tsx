import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { GridCanvas, COLS, ROWS } from './components/GridCanvas'
import { ClaimModal } from './components/ClaimModal'
import { IntroOverlay, shouldShowIntro } from './components/IntroOverlay'
import { supabase } from './lib/supabase'
import { rowToCell } from './types'
import type { CellData } from './types'

// Cells must be at least this many px wide before we skip the "zoom or claim" prompt
const VISIBLE_PX_THRESHOLD = 20

// ── Zoom-or-claim popup ───────────────────────────────────────────────────────
interface ZoomPrompt {
  row: number; col: number; cell: CellData | null
  x: number; y: number   // client coords of the click
}

function ZoomOrClaimPopup({
  prompt, onZoom, onOpen, onDismiss,
}: {
  prompt: ZoomPrompt
  onZoom: () => void
  onOpen: () => void
  onDismiss: () => void
}) {
  const { row, col, cell, x, y } = prompt
  const cellNum = row * COLS + col + 1

  // Keep popup in viewport
  const W = 210, H = 96
  const left = Math.max(8, Math.min(window.innerWidth  - W - 8, x - W / 2))
  const top  = y - H - 16 < 8
    ? y + 16      // not enough room above → appear below
    : y - H - 16  // appear above the click point

  return (
    <>
      {/* Invisible backdrop to dismiss */}
      <div
        onClick={onDismiss}
        style={{ position: 'fixed', inset: 0, zIndex: 90 }}
      />
      <div style={{
        position: 'fixed', left, top, width: W, zIndex: 91,
        background: '#fff', borderRadius: '12px',
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        padding: '12px 12px 10px',
      }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, color: '#6b7280',
          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px',
        }}>
          Cell #{cellNum.toLocaleString()}{cell ? ' · claimed' : ''}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { onZoom(); onDismiss() }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: '8px',
              border: '1.5px solid #e2e8f0', background: '#f9fafb',
              cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
              color: '#374151',
            }}
          >
            🔍 Zoom here
          </button>
          <button
            onClick={() => { onOpen(); onDismiss() }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none',
              background: cell ? '#6b7280' : '#3b82f6',
              color: '#fff', cursor: 'pointer',
              fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            {cell ? 'View' : 'Claim'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Search result type ────────────────────────────────────────────────────────
interface SearchResult {
  cell: CellData | null
  row: number
  col: number
  cellNum: number
  label: string
}

// ── SearchBox component ───────────────────────────────────────────────────────
function SearchBox({ cells, onNavigate, onOpen }: {
  cells: Map<string, CellData>
  onNavigate: (row: number, col: number) => void
  onOpen: (row: number, col: number, cell: CellData | null) => void
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur()
        setQuery('')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const results = useMemo((): SearchResult[] => {
    const q = query.trim()
    if (!q) return []
    const isNum = /^\d+$/.test(q)
    const found: SearchResult[] = []

    if (isNum) {
      const n = parseInt(q)
      for (const cell of cells.values()) {
        const num = cell.row * COLS + cell.col + 1
        if (String(num).startsWith(q)) {
          found.push({ cell, row: cell.row, col: cell.col, cellNum: num, label: cell.ownerName || 'Anonymous' })
          if (found.length >= 8) break
        }
      }
      if (n >= 1 && n <= ROWS * COLS && !found.find(r => r.cellNum === n)) {
        const row = Math.floor((n - 1) / COLS)
        const col = (n - 1) % COLS
        found.unshift({ cell: null, row, col, cellNum: n, label: 'empty' })
      }
    } else {
      const ql = q.toLowerCase()
      for (const cell of cells.values()) {
        const name = cell.ownerName || 'Anonymous'
        if (name.toLowerCase().includes(ql) || cell.contentText.toLowerCase().includes(ql)) {
          found.push({ cell, row: cell.row, col: cell.col, cellNum: cell.row * COLS + cell.col + 1, label: name })
          if (found.length >= 8) break
        }
      }
    }
    return found
  }, [query, cells])

  const handleSelect = (r: SearchResult) => {
    onNavigate(r.row, r.col)
    onOpen(r.row, r.col, r.cell)
    setQuery(''); setFocused(false); inputRef.current?.blur()
  }

  const showDropdown = focused && query.trim().length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(255,255,255,0.9)', border: '1.5px solid rgba(0,0,0,0.12)',
        borderRadius: '8px', padding: '6px 10px',
      }}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
          <circle cx="9" cy="9" r="6" stroke="#111" strokeWidth="2"/>
          <path d="M13.5 13.5L17 17" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setFocused(true) }}
          onFocus={() => setFocused(true)}
          placeholder="Search  (⌘F)"
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: '13px', width: '140px', fontFamily: 'inherit', color: '#111827',
          }}
        />
      </div>

      {showDropdown && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          minWidth: '240px', overflow: 'hidden', zIndex: 200,
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '13px', color: '#9ca3af' }}>No results</div>
          ) : results.map(r => (
            <div
              key={`${r.row}:${r.col}`}
              onClick={() => handleSelect(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                background: r.cell?.bgColor ?? '#e5e7eb', border: '1px solid rgba(0,0,0,0.08)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.cell ? r.label : <span style={{ color: '#9ca3af', fontWeight: 400 }}>Cell #{r.cellNum} — empty</span>}
                </div>
                {r.cell?.contentText && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.cell.contentText}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>#{r.cellNum}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export function App() {
  const [cells, setCells]         = useState<Map<string, CellData>>(new Map())
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<{ row: number; col: number; cell: CellData | null } | null>(null)
  const [zoomPrompt, setZoomPrompt] = useState<ZoomPrompt | null>(null)
  const [showIntro, setShowIntro] = useState(shouldShowIntro)
  const goToCellRef   = useRef<((row: number, col: number) => void) | null>(null)
  const zoomToCellRef = useRef<((row: number, col: number) => void) | null>(null)

  useEffect(() => {
    supabase
      .from('cells')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error('Failed to load cells:', error)
        const map = new Map<string, CellData>()
        for (const row of data ?? []) map.set(row.id, rowToCell(row))
        setCells(map)
        setLoading(false)
      })

    const channel = supabase
      .channel('cells-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cells' }, payload => {
        const cell = rowToCell(payload.new as Record<string, unknown>)
        setCells(prev => new Map(prev).set(cell.id, cell))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleCellClick = useCallback((
    row: number, col: number, cell: CellData | null,
    cellPx: number, sx: number, sy: number,
  ) => {
    // If cells are tiny (<20px), user might not know what they clicked — give them a choice
    if (cellPx < VISIBLE_PX_THRESHOLD) {
      setZoomPrompt({ row, col, cell, x: sx, y: sy })
    } else {
      setModal({ row, col, cell })
    }
  }, [])

  const handleClaimed = useCallback((cell: CellData) => {
    setCells(prev => new Map(prev).set(cell.id, cell))
    setModal(null)
  }, [])

  const handleNavigate = useCallback((row: number, col: number) => {
    goToCellRef.current?.(row, col)
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#eef0f5' }}>
      <GridCanvas
        cells={cells}
        onCellClick={handleCellClick}
        goToCellRef={goToCellRef}
        zoomToCellRef={zoomToCellRef}
      />

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#eef0f5', zIndex: 50,
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>loading…</div>
        </div>
      )}

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', pointerEvents: 'none',
      }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'all', cursor: 'pointer' }}
          onClick={() => setShowIntro(true)}
          title="What is this?"
        >
          <img src="/logo.svg" alt="The Grid" width={32} height={32} style={{ borderRadius: '6px' }} />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1 }}>
              The Grid
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(0,0,0,0.38)', marginTop: '2px' }}>
              $1 to lock a cell forever
            </div>
          </div>
        </div>

        <div style={{ pointerEvents: 'all' }}>
          <SearchBox cells={cells} onNavigate={handleNavigate} onOpen={(r, c, cell) => setModal({ row: r, col: c, cell })} />
        </div>
      </div>

      {/* Intro overlay */}
      {showIntro && <IntroOverlay onDone={() => setShowIntro(false)} />}

      {/* Zoom-or-claim popup */}
      {zoomPrompt && (
        <ZoomOrClaimPopup
          prompt={zoomPrompt}
          onZoom={() => zoomToCellRef.current?.(zoomPrompt.row, zoomPrompt.col)}
          onOpen={() => setModal({ row: zoomPrompt.row, col: zoomPrompt.col, cell: zoomPrompt.cell })}
          onDismiss={() => setZoomPrompt(null)}
        />
      )}

      {modal && (
        <ClaimModal
          row={modal.row}
          col={modal.col}
          cell={modal.cell}
          onClose={() => setModal(null)}
          onClaimed={handleClaimed}
        />
      )}
    </div>
  )
}
