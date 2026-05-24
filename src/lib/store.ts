/**
 * localStorage-backed cell store.
 * Swap loadCells / saveCell implementations for Supabase when ready.
 */
import type { CellData } from '../types'

const STORAGE_KEY = 'grid_cells'

export function loadCells(): Map<string, CellData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const arr: CellData[] = JSON.parse(raw)
    return new Map(arr.map(c => [c.id, c]))
  } catch {
    return new Map()
  }
}

export function saveCell(cell: CellData): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr: CellData[] = raw ? JSON.parse(raw) : []
    const idx = arr.findIndex(c => c.id === cell.id)
    if (idx >= 0) arr[idx] = cell
    else arr.push(cell)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  } catch {
    console.error('Failed to save cell to localStorage')
  }
}
