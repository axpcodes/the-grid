export interface CellData {
  id: string        // "row:col"
  row: number
  col: number
  ownerId: string   // UUID persisted in localStorage
  ownerName: string
  contentText: string
  imageUrl: string
  contact: string   // link / social / email — shown on the cell info view
  bgColor: string   // hex
  claimedAt: string // ISO timestamp
}
