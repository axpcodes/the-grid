import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { GridCanvas, COLS, ROWS } from './components/GridCanvas'
import type { GridApi } from './components/GridCanvas'
import { ClaimModal } from './components/ClaimModal'
import { IntroOverlay, shouldShowIntro } from './components/IntroOverlay'
import type { IntroAction } from './components/IntroOverlay'
import { supabase } from './lib/supabase'
import { rowToCell } from './types'
import type { CellData } from './types'
import { INK, INK_SOFT, INK_FAINT, SURFACE, LINE, SERIF, btnPrimary, cellNumber } from './lib/ui'

type Sel = { row: number; col: number }

const fromNumber = (n: number): Sel => ({ row: Math.floor((n - 1) / COLS), col: (n - 1) % COLS })

/** ?c=123456 deep links straight to a cell. */
function readDeepLink(): Sel | null {
  const n = parseInt(new URLSearchParams(location.search).get('c') ?? '', 10)
  return n >= 1 && n <= ROWS * COLS ? fromNumber(n) : null
}
function setUrlCell(sel: Sel | null) {
  const url = sel ? `?c=${cellNumber(sel.row, sel.col, COLS)}` : location.pathname
  history.replaceState(null, '', url)
}

/** Nearest unclaimed cell to (row, col), searching outward in square rings. */
function nearestEmpty(cells: Map<string, CellData>, row: number, col: number): Sel {
  for (let d = 0; d < 500; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue
        const r = (row + dr + ROWS) % ROWS, c = (col + dc + COLS) % COLS
        if (!cells.has(`${r}:${c}`)) return { row: r, col: c }
      }
    }
  }
  return { row, col }
}

// ── Search ───────────────────────────────────────────────────────────────────
interface SearchResult { cell: CellData | null; row: number; col: number; cellNum: number; label: string }

function SearchBox({ cells, narrow, onPick }: {
  cells: Map<string, CellData>
  narrow: boolean
  onPick: (row: number, col: number) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); setOpen(true)
        requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select() })
      }
      if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur() }
    }
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); if (!query) setQuery('') }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [query])

  const results = useMemo((): SearchResult[] => {
    const q = query.trim()
    if (!q) return []
    const found: SearchResult[] = []
    if (/^#?\d[\d,]*$/.test(q)) {
      const digits = q.replace(/[#,]/g, '')
      const n = parseInt(digits, 10)
      if (n >= 1 && n <= ROWS * COLS) {
        const { row, col } = fromNumber(n)
        const cell = cells.get(`${row}:${col}`) ?? null
        found.push({ cell, row, col, cellNum: n, label: cell ? (cell.ownerName || 'Anonymous') : 'Empty — go there' })
      }
      for (const cell of cells.values()) {
        const num = cellNumber(cell.row, cell.col, COLS)
        if (num !== n && String(num).startsWith(digits)) {
          found.push({ cell, row: cell.row, col: cell.col, cellNum: num, label: cell.ownerName || 'Anonymous' })
          if (found.length >= 8) break
        }
      }
    } else {
      const ql = q.toLowerCase()
      for (const cell of cells.values()) {
        const name = cell.ownerName || 'Anonymous'
        if (name.toLowerCase().includes(ql) || cell.contentText.toLowerCase().includes(ql)) {
          found.push({ cell, row: cell.row, col: cell.col, cellNum: cellNumber(cell.row, cell.col, COLS), label: name })
          if (found.length >= 8) break
        }
      }
    }
    return found
  }, [query, cells])

  const pick = (r: SearchResult) => {
    onPick(r.row, r.col)
    setQuery(''); setOpen(false); inputRef.current?.blur()
  }

  const collapsed = narrow && !open
  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {collapsed ? (
        <button
          aria-label="Search"
          onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }}
          style={{ ...chip, width: 44, padding: 0, justifyContent: 'center' }}
        >
          <SearchIcon />
        </button>
      ) : (
        <div style={{ ...chip, width: narrow ? 'calc(100vw - 28px)' : 250, cursor: 'text' }} onClick={() => inputRef.current?.focus()}>
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={narrow ? 'Name, words, or cell #' : 'Search  ⌘F'}
            enterKeyHint="search"
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) pick(results[0]) }}
            style={{
              border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0,
              fontSize: 16, fontFamily: 'inherit', color: INK,
            }}
          />
          {narrow && (
            <button aria-label="Close search" onClick={e => { e.stopPropagation(); setOpen(false); setQuery('') }}
              style={{ border: 'none', background: 'none', color: INK_FAINT, fontSize: 20, cursor: 'pointer', padding: '0 2px' }}>×</button>
          )}
        </div>
      )}

      {open && query.trim() && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: narrow ? 'calc(100vw - 28px)' : 320,
          background: SURFACE, borderRadius: 16, border: `1px solid ${LINE}`, overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(40,30,15,0.18)', zIndex: 200, animation: 'pop-in .15s ease both',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 14, color: INK_FAINT }}>Nothing yet.</div>
          ) : results.map(r => (
            <button
              key={`${r.row}:${r.col}`}
              onClick={() => pick(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '11px 16px', border: 'none', borderBottom: `1px solid ${LINE}`,
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', minHeight: 52,
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: 4, flexShrink: 0,
                background: r.cell ? (r.cell.bgColor || '#fff') : 'transparent',
                border: r.cell ? '1px solid rgba(0,0,0,0.08)' : `1.5px dashed ${INK_FAINT}`,
              }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: r.cell ? INK : INK_SOFT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.label}
                </span>
                {r.cell?.contentText && (
                  <span style={{ display: 'block', fontSize: 12, color: INK_FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.cell.contentText}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 12, color: INK_FAINT, flexShrink: 0 }}>#{r.cellNum.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px',
  borderRadius: 999, background: 'rgba(255,253,248,0.92)', border: `1px solid ${LINE}`,
  boxShadow: '0 4px 18px rgba(40,30,15,0.10)', color: INK, cursor: 'pointer',
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r="6" stroke={INK} strokeWidth="1.8" />
      <path d="M13.5 13.5L17 17" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

// ── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; text: string; action?: { label: string; run: () => void } }

// ── App ──────────────────────────────────────────────────────────────────────
export function App() {
  const [cells, setCells]       = useState<Map<string, CellData>>(new Map())
  const [status, setStatus]     = useState<'loading' | 'ready' | 'error'>('loading')
  const [modal, setModal]       = useState<{ row: number; col: number; cell: CellData | null } | null>(null)
  const [selection, setSelection] = useState<Sel | null>(null)
  const [showIntro, setShowIntro] = useState(() => !readDeepLink() && shouldShowIntro())
  const [toast, setToast]       = useState<Toast | null>(null)
  const [narrow, setNarrow]     = useState(() => window.innerWidth < 560)
  const apiRef      = useRef<GridApi | null>(null)
  const cellsRef    = useRef(cells)
  cellsRef.current  = cells
  const deepLink    = useRef(readDeepLink())
  const placed      = useRef(false)

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 560)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  const showToast = useCallback((text: string, action?: Toast['action'], ms = 6000) => {
    const id = Date.now()
    setToast({ id, text, action })
    window.setTimeout(() => setToast(t => (t?.id === id ? null : t)), ms)
  }, [])

  const openCell = useCallback((row: number, col: number) => {
    const cell = cellsRef.current.get(`${row}:${col}`) ?? null
    apiRef.current?.select(row, col)
    setModal({ row, col, cell })
    setUrlCell({ row, col })
  }, [])

  const closeModal = useCallback(() => { setModal(null); setUrlCell(null) }, [])

  // ── Load + live updates ────────────────────────────────────────────────────
  const load = useCallback(() => {
    setStatus('loading')
    supabase.from('cells').select('*').then(({ data, error }) => {
      if (error) { console.error('Failed to load cells:', error); setStatus('error'); return }
      const map = new Map<string, CellData>()
      for (const row of data ?? []) map.set(row.id, rowToCell(row))
      setCells(map)
      setStatus('ready')
    })
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('cells-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cells' }, payload => {
        const cell = rowToCell(payload.new as Record<string, unknown>)
        if (cellsRef.current.has(cell.id)) return   // our own claim, already shown
        setCells(prev => new Map(prev).set(cell.id, cell))
        apiRef.current?.pulse(cell.row, cell.col)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // ── First camera placement: deep link → latest mark → middle of the wall ───
  useEffect(() => {
    if (placed.current || status === 'loading' || !apiRef.current) return
    placed.current = true
    const dl = deepLink.current
    if (dl) {
      apiRef.current.jumpTo(dl.row, dl.col, 88)
      if (status === 'ready') openCell(dl.row, dl.col)
      else apiRef.current.select(dl.row, dl.col)   // don't offer to claim a square we couldn't check
      return
    }
    let latest: CellData | null = null
    for (const c of cells.values()) if (!latest || c.claimedAt > latest.claimedAt) latest = c
    if (latest) apiRef.current.jumpTo(latest.row, latest.col, narrow ? 34 : 40)
    else apiRef.current.jumpTo(ROWS / 2, COLS / 2, 12)
  }, [status, cells, narrow, openCell])

  // ── Actions ────────────────────────────────────────────────────────────────
  const goAndOpen = useCallback(async (row: number, col: number) => {
    await apiRef.current?.flyTo(row, col, { select: true })
    openCell(row, col)
  }, [openCell])

  const leaveMark = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const target = selection && !cells.has(`${selection.row}:${selection.col}`)
      ? selection
      : nearestEmpty(cells, api.centerCell().row, api.centerCell().col)
    void goAndOpen(target.row, target.col)
  }, [selection, cells, goAndOpen])

  const share = useCallback(async (row: number, col: number) => {
    const n = cellNumber(row, col, COLS)
    const url = `${location.origin}/?c=${n}`
    const text = 'A square on humanity’s last mural.'
    if (navigator.share) {
      try { await navigator.share({ title: 'The Grid', text, url }); return } catch { return }
    }
    try { await navigator.clipboard.writeText(url); showToast('Link copied.') }
    catch { showToast(url) }
  }, [showToast])

  const handleClaimed = useCallback((cell: CellData) => {
    setCells(prev => new Map(prev).set(cell.id, cell))
    setModal(null)
    setUrlCell({ row: cell.row, col: cell.col })
    apiRef.current?.select(cell.row, cell.col)
    apiRef.current?.pulse(cell.row, cell.col, true)
    showToast(
      `You’re on the wall. Cell #${cellNumber(cell.row, cell.col, COLS).toLocaleString()}.`,
      { label: 'Share', run: () => void share(cell.row, cell.col) },
      12000,
    )
  }, [share, showToast])

  const onIntroDone = useCallback((action: IntroAction) => {
    setShowIntro(false)
    if (action === 'claim') window.setTimeout(leaveMark, 150)
  }, [leaveMark])

  const selCell = selection ? cells.get(`${selection.row}:${selection.col}`) ?? null : null
  const ctaLabel = selection
    ? (selCell ? `Open #${cellNumber(selection.row, selection.col, COLS).toLocaleString()}` : `Claim #${cellNumber(selection.row, selection.col, COLS).toLocaleString()}`)
    : 'Leave your mark'
  const onCta = () => {
    if (selection && selCell) void goAndOpen(selection.row, selection.col)
    else leaveMark()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f3efe6', overflow: 'hidden' }}>
      <GridCanvas
        cells={cells}
        apiRef={apiRef}
        onOpen={openCell}
        onSelect={setSelection}
      />

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none',
        padding: 'calc(12px + env(safe-area-inset-top)) 14px 0',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
      }}>
        <button
          onClick={() => setShowIntro(true)}
          title="What is this?"
          style={{ ...chip, pointerEvents: 'auto', paddingLeft: 6, gap: 10, height: 44 }}
        >
          <img src="/logo.svg" alt="" width={30} height={30} style={{ borderRadius: 999 }} />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.05, paddingRight: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em' }}>The Grid</span>
            <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: INK_SOFT }}>
              {status === 'ready' && cells.size
                ? `${cells.size.toLocaleString()} of 1,000,000 marks`
                : 'humanity’s last mural'}
            </span>
          </span>
        </button>
        <div style={{ pointerEvents: 'auto', position: narrow ? 'absolute' : 'relative', right: narrow ? 14 : undefined, top: narrow ? 'calc(12px + env(safe-area-inset-top))' : undefined }}>
          <SearchBox cells={cells} narrow={narrow} onPick={(r, c) => void goAndOpen(r, c)} />
        </div>
      </div>

      {/* Status */}
      {status !== 'ready' && (
        <div style={{
          position: 'absolute', left: '50%', top: 'calc(70px + env(safe-area-inset-top))', transform: 'translateX(-50%)',
          ...chip, height: 38, fontSize: 13, color: INK_SOFT, cursor: 'default', whiteSpace: 'nowrap',
          animation: 'fade-in .3s ease both',
        }}>
          {status === 'loading' ? 'Loading the wall…' : (
            <>Couldn’t reach the wall. <button onClick={load} style={{ border: 'none', background: 'none', color: INK, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textDecoration: 'underline' }}>Retry</button></>
          )}
        </div>
      )}

      {/* Primary action + toast, thumb-reachable */}
      {!modal && !showIntro && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 'calc(14px + env(safe-area-inset-bottom))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'none',
        }}>
          {toast && (
            <div key={toast.id} role="status" style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12,
              background: INK, color: SURFACE, borderRadius: 16, padding: '10px 10px 10px 16px',
              maxWidth: 'calc(100vw - 28px)', fontSize: 14, boxShadow: '0 12px 30px rgba(20,16,12,0.3)',
              animation: 'fade-up .3s ease both',
            }}>
              <span style={{ flex: 1 }}>{toast.text}</span>
              {toast.action && (
                <button onClick={() => { toast.action!.run(); setToast(null) }} style={{
                  border: 'none', borderRadius: 999, background: SURFACE, color: INK, minHeight: 36,
                  padding: '0 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
          <button
            onClick={onCta}
            style={{
              ...btnPrimary, pointerEvents: 'auto', minHeight: 54, padding: '0 26px', fontSize: 16,
              boxShadow: '0 12px 32px rgba(20,16,12,0.28)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              {selCell
                ? <path d="M3 10h14M11 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M10 3V17M3 10H17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
            </svg>
            {ctaLabel}
          </button>
        </div>
      )}

      {showIntro && <IntroOverlay onDone={onIntroDone} claimedCount={status === 'ready' ? cells.size : undefined} />}

      {modal && (
        <ClaimModal
          key={`${modal.row}:${modal.col}`}
          row={modal.row}
          col={modal.col}
          cell={modal.cell}
          onClose={closeModal}
          onClaimed={handleClaimed}
          onShare={(r, c) => void share(r, c)}
          onAbout={() => { closeModal(); setShowIntro(true) }}
        />
      )}
    </div>
  )
}
