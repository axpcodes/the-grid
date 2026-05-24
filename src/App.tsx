import { useState, useCallback, useRef } from 'react'
import { GridCanvas } from './components/GridCanvas'
import { ClaimModal } from './components/ClaimModal'
import { loadCells, saveCell } from './lib/store'
import { getOwnerId } from './lib/ownerId'
import type { CellData } from './types'

const COLS = 100
const ROWS = 100
const ownerId = getOwnerId()

export function App() {
  const [cells, setCells] = useState<Map<string, CellData>>(() => loadCells())
  const [modal, setModal] = useState<{ row: number; col: number; cell: CellData | null } | null>(null)
  const [goToInput, setGoToInput] = useState('')
  const goToCellRef = useRef<((row: number, col: number) => void) | null>(null)

  const handleCellClick = useCallback((row: number, col: number, cell: CellData | null) => {
    setModal({ row, col, cell })
  }, [])

  const handleSave = useCallback((data: Pick<CellData, 'ownerName' | 'contentText' | 'imageUrl' | 'contact' | 'bgColor'>) => {
    if (!modal) return
    const { row, col } = modal
    const record: CellData = {
      id: `${row}:${col}`,
      row, col, ownerId,
      claimedAt: new Date().toISOString(),
      ...data,
    }
    saveCell(record)
    setCells(prev => new Map(prev).set(record.id, record))
  }, [modal])

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

      {/* Title — top left */}
      <div style={{
        position: 'absolute', top: 14, left: 14,
        pointerEvents: 'none', userSelect: 'none',
      }}>
        <div style={{ fontSize: '17px', fontWeight: 800, color: '#111827', letterSpacing: '-0.01em' }}>
          The Grid
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(0,0,0,0.4)', marginTop: '2px' }}>
          Pinch or Ctrl+scroll to zoom · drag to pan · click to claim
        </div>
      </div>

      {/* Go-to search — top right */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        display: 'flex', gap: '6px', alignItems: 'center',
      }}>
        <input
          value={goToInput}
          onChange={e => setGoToInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGoTo()}
          placeholder="Go to cell #"
          style={{
            padding: '7px 11px',
            border: '1.5px solid rgba(0,0,0,0.12)',
            borderRadius: '8px',
            fontSize: '13px',
            width: '130px',
            outline: 'none',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(6px)',
          }}
        />
        <button
          onClick={handleGoTo}
          style={{
            padding: '7px 12px',
            background: '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
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
          onSave={handleSave}
        />
      )}
    </div>
  )
}
