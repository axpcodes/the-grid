import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { rowToCell } from './types'
import type { CellData } from './types'

const COLS = 100

// ── Password gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setChecking(true)
    setError('')
    // Validate by hitting the API with a no-op delete — if 401, wrong password
    const res = await fetch('/api/admin-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: value, mode: 'ids', ids: [] }),
    })
    setChecking(false)
    if (res.status === 401) { setError('Wrong password.'); return }
    onAuth(value)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ background: '#1e293b', borderRadius: '16px', padding: '40px', width: '320px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>The Grid</div>
        <h1 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 800, margin: '0 0 24px' }}>Admin</h1>
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }}
        />
        {error && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '10px' }}>{error}</div>}
        <button
          type="submit"
          disabled={checking || !value}
          style={{ width: '100%', padding: '11px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: checking ? 'not-allowed' : 'pointer', opacity: checking ? 0.7 : 1 }}
        >
          {checking ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}

// ── Main admin panel ──────────────────────────────────────────────────────────
function AdminPanel({ password }: { password: string }) {
  const [cells, setCells] = useState<CellData[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [working, setWorking] = useState(false)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('cells').select('*').order('claimed_at', { ascending: false })
    setCells((data ?? []).map(r => rowToCell(r as Record<string, unknown>)))
    setLoading(false)
    setSelected(new Set())
  }, [])

  useEffect(() => { load() }, [load])

  const callDelete = async (body: object) => {
    setWorking(true)
    setStatus('')
    const res = await fetch('/api/admin-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, ...body }),
    })
    const json = await res.json()
    setWorking(false)
    if (!res.ok) { setStatus(`Error: ${json.error}`); return false }
    return true
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} cell(s)?`)) return
    const ok = await callDelete({ mode: 'ids', ids: Array.from(selected) })
    if (ok) { setStatus(`Deleted ${selected.size} cell(s).`); load() }
  }

  const deleteAll = async () => {
    if (!confirm('Delete ALL cells? This cannot be undone.')) return
    if (!confirm('Are you absolutely sure?')) return
    const ok = await callDelete({ mode: 'all' })
    if (ok) { setStatus('All cells deleted.'); load() }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(c => c.id)))
  }

  const filtered = cells.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.ownerName.toLowerCase().includes(q) ||
      c.contentText.toLowerCase().includes(q) ||
      c.id.includes(q) ||
      String(c.row * COLS + c.col + 1).includes(q)
    )
  })

  const allSelected = filtered.length > 0 && selected.size === filtered.length

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>The Grid</div>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>Admin</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {cells.length} cell{cells.length !== 1 ? 's' : ''} claimed
          </span>
          <button onClick={load} disabled={loading || working} style={ghostBtn}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button onClick={deleteSelected} disabled={selected.size === 0 || working} style={yellowBtn}>
            Delete selected ({selected.size})
          </button>
          <button onClick={deleteAll} disabled={working || cells.length === 0} style={redBtn}>
            Nuke everything
          </button>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <div style={{ background: status.startsWith('Error') ? '#450a0a' : '#052e16', borderBottom: '1px solid #334155', padding: '10px 24px', fontSize: '13px', color: status.startsWith('Error') ? '#fca5a5' : '#86efac' }}>
          {status}
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '16px 24px 0' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, message, cell #…"
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #334155', background: '#1e293b', color: '#f1f5f9', fontSize: '14px', outline: 'none', width: '280px' }}
        />
      </div>

      {/* Table */}
      <div style={{ padding: '16px 24px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ color: '#64748b', padding: '32px 0' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#64748b', padding: '32px 0' }}>{search ? 'No results.' : 'No cells claimed yet.'}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px 8px 0', width: '32px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '8px 12px' }}>#</th>
                <th style={{ padding: '8px 12px' }}>Color</th>
                <th style={{ padding: '8px 12px' }}>Name</th>
                <th style={{ padding: '8px 12px' }}>Message</th>
                <th style={{ padding: '8px 12px' }}>Link</th>
                <th style={{ padding: '8px 12px' }}>Claimed</th>
                <th style={{ padding: '8px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(cell => (
                <tr
                  key={cell.id}
                  style={{ borderBottom: '1px solid #1e293b', background: selected.has(cell.id) ? '#1e3a5f' : 'transparent', transition: 'background 0.1s' }}
                >
                  <td style={{ padding: '10px 12px 10px 0' }}>
                    <input type="checkbox" checked={selected.has(cell.id)} onChange={() => toggleSelect(cell.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {cell.row * COLS + cell.col + 1}
                    <span style={{ color: '#475569', marginLeft: '4px', fontSize: '11px' }}>({cell.row},{cell.col})</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: cell.bgColor, border: '1px solid #334155' }} />
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e2e8f0', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cell.ownerName}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cell.contentText || <span style={{ color: '#475569', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cell.contact
                      ? <a href={cell.contact.startsWith('http') ? cell.contact : `https://${cell.contact}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>{cell.contact}</a>
                      : <span style={{ color: '#475569', fontStyle: 'italic' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(cell.claimedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete cell #${cell.row * COLS + cell.col + 1} (${cell.ownerName})?`)) return
                        const ok = await callDelete({ mode: 'ids', ids: [cell.id] })
                        if (ok) { setStatus(`Deleted cell ${cell.id}.`); load() }
                      }}
                      disabled={working}
                      style={{ background: 'none', border: '1px solid #475569', color: '#f87171', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function AdminApp() {
  const [password, setPassword] = useState<string | null>(
    sessionStorage.getItem('admin_pw')
  )

  const handleAuth = (pw: string) => {
    sessionStorage.setItem('admin_pw', pw)
    setPassword(pw)
  }

  if (!password) return <PasswordGate onAuth={handleAuth} />
  return <AdminPanel password={password} />
}

// ── Button styles ─────────────────────────────────────────────────────────────
const ghostBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: '8px', border: '1px solid #334155',
  background: 'transparent', color: '#94a3b8', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const yellowBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: '8px', border: 'none',
  background: '#854d0e', color: '#fef08a', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}
const redBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: '8px', border: 'none',
  background: '#7f1d1d', color: '#fca5a5', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}
