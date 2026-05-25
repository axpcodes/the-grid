export interface CellData {
  id: string          // "row:col"
  row: number
  col: number
  ownerName: string
  contentText: string
  imageUrl: string
  contact: string
  bgColor: string
  claimedAt: string
}

/** Convert a raw Supabase row to CellData */
export function rowToCell(row: Record<string, unknown>): CellData {
  return {
    id:          row.id          as string,
    row:         row.row_idx     as number,
    col:         row.col_idx     as number,
    ownerName:   row.owner_name  as string,
    contentText: row.content_text as string,
    imageUrl:    row.image_url   as string,
    contact:     row.contact     as string,
    bgColor:     row.bg_color    as string,
    claimedAt:   row.claimed_at  as string,
  }
}
