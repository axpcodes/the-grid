import { useState, useCallback, useRef, useEffect } from 'react'
import { GridCanvas } from './components/GridCanvas'
import { ClaimModal } from './components/ClaimModal'
import { supabase } from './lib/supabase'
import { rowToCell } from './types'
import type { CellData } from './types'

const COLS = 100
const ROWS = 100

export function App() {
  const [cells, setCells] = useState<Map<string, CellData>>(new Map())
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ row: number; col: number; cell: CellData | null } | null>(null)
  const [goToInput, setGoToInput] = useState('')
  const goToCellRef = useRef<((row: number, col: number) => void) | null>(null)

  // ── Load all claimed cells + subscribe to live updates ──────────────────
  useEffect(() => {
    // Initial fetch
    supabase
      .from('cells')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error('Failed to load cells:', error)
        const map = new Map<string, CellData>()
        for (const row of data ?? []) map.set(row.id, rowToCell(row))
        setCells(map)
        setLoading(false) // always clear loading, even on error
      })

    // Realtime: show new claims from other users instantly
    const channel = supabase
      .channel('cells-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cells' },
        payload => {
          const cell = rowToCell(payload.new as Record<string, unknown>)
          setCells(prev => new Map(prev).set(cell.id, cell))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleCellClick = useCallback((row: number, col: number, cell: CellData | null) => {
    setModal({ row, col, cell })
  }, [])

  // Called by ClaimModal after payment + DB write succeed
  const handleClaimed = useCallback((cell: CellData) => {
    setCells(prev => new Map(prev).set(cell.id, cell))
    setModal(null)
  }, [])

  const handleGoTo = () => {
    const n = parseInt(goToInput.trim(), 10)
    if (isNaN(n) || n < 1 || n > ROWS * COLS) return
    const row = Math.floor((n - 1) / COLS)
    const col = (n - 1) % COLS
    goToCellRef.current?.(row, col)
    setGoToInput('')
  }

  const claimedCount = cells.size

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#eef0f5' }}>
      <GridCanvas cells={cells} onCellClick={handleCellClick} goToCellRef={goToCellRef} />

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#eef0f5', zIndex: 50,
        }}>
          <div style={{ fontSize: '15px', color: '#6b7280', fontWeight: 500 }}>Loading the grid…</div>
        </div>
      )}

      {/* Title — top left */}
      <div style={{ position: 'absolute', top: 14, left: 14, pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ fontSize: '17px', fontWeight: 800, color: '#111827', letterSpacing: '-0.01em' }}>
          The Grid
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(0,0,0,0.4)', marginTop: '2px' }}>
          Pinch or Ctrl+scroll to zoom · drag to pan · click to claim
        </div>
      </div>

      {/* Go-to search — top right */}
      <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          value={goToInput}
          onChange={e => setGoToInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGoTo()}
          placeholder="Go to cell #"
          style={{
            padding: '7px 11px', border: '1.5px solid rgba(0,0,0,0.12)',
            borderRadius: '8px', fontSize: '13px', width: '130px',
            outline: 'none', background: 'rgba(255,255,255,0.85)',
          }}
        />
        <button
          onClick={handleGoTo}
          style={{
            padding: '7px 12px', background: '#111827', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Go
        </button>
      </div>

      {/* Stats — bottom right */}
      <div style={{
        position: 'absolute', bottom: 14, right: 14,
        fontSize: '12px', color: 'rgba(0,0,0,0.4)',
        pointerEvents: 'none', userSelect: 'none', textAlign: 'right',
      }}>
        <span style={{ color: '#16a34a', fontWeight: 700 }}>{claimedCount.toLocaleString()}</span>
        {' / 10,000 cells claimed'}
      </div>

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
