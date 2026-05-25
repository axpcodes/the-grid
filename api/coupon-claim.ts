import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // service role — bypasses RLS for trusted writes
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { couponCode, row, col, ownerName, contentText, imageUrl, contact, bgColor } = req.body

  // Validate coupon code server-side only — never exposed to the client
  const validCode = process.env.COUPON_CODE
  if (!validCode) {
    return res.status(503).json({ error: 'Coupon codes are not enabled.' })
  }
  if (!couponCode || couponCode.trim() !== validCode) {
    return res.status(403).json({ error: 'Invalid coupon code.' })
  }

  if (row == null || col == null) {
    return res.status(400).json({ error: 'Missing cell coordinates.' })
  }

  const id = `${row}:${col}`

  // Race-condition guard: check cell isn't already claimed
  const { data: existing } = await supabase
    .from('cells')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (existing) {
    return res.status(409).json({ error: 'This cell has already been claimed.' })
  }

  const { error } = await supabase.from('cells').insert({
    id,
    row_idx:           parseInt(row),
    col_idx:           parseInt(col),
    owner_name:        ownerName  || '',
    content_text:      contentText || '',
    image_url:         imageUrl   || '',
    contact:           contact    || '',
    bg_color:          bgColor    || '#ffffff',
    stripe_payment_id: 'COUPON',
  })

  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
}
