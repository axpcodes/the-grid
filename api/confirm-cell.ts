import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // service role — bypasses RLS for trusted writes
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { paymentIntentId } = req.body
  if (!paymentIntentId) return res.status(400).json({ error: 'Missing paymentIntentId' })

  try {
    // 1. Verify payment actually succeeded with Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment not confirmed' })
    }

    const { row, col, ownerName, contentText, imageUrl, contact, bgColor } = pi.metadata
    const id = `${row}:${col}`

    // 2. Check the cell isn't already claimed (race condition guard)
    const { data: existing } = await supabase
      .from('cells')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existing) {
      // Cell was claimed by someone else between payment and confirmation.
      // In production you'd trigger a Stripe refund here.
      return res.status(409).json({ error: 'Cell was just claimed by someone else. A refund will be issued.' })
    }

    // 3. Write the cell
    const { error } = await supabase.from('cells').insert({
      id,
      row_idx:           parseInt(row),
      col_idx:           parseInt(col),
      owner_name:        ownerName,
      content_text:      contentText,
      image_url:         imageUrl,
      contact:           contact,
      bg_color:          bgColor,
      stripe_payment_id: paymentIntentId,
    })

    if (error) return res.status(500).json({ error: error.message })

    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    res.status(500).json({ error: message })
  }
}
