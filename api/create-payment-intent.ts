import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { row, col, ownerName, contentText, imageUrl, contact, bgColor } = req.body

  // Basic validation
  if (typeof row !== 'number' || typeof col !== 'number') {
    return res.status(400).json({ error: 'Invalid cell coordinates' })
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 100, // $1.00 in cents
      currency: 'usd',
      // Store cell data in metadata so confirm-cell can write it after payment
      metadata: {
        row:         String(row),
        col:         String(col),
        ownerName:   String(ownerName  ?? '').slice(0, 500),
        contentText: String(contentText ?? '').slice(0, 500),
        imageUrl:    String(imageUrl   ?? '').slice(0, 500),
        contact:     String(contact    ?? '').slice(0, 500),
        bgColor:     String(bgColor    ?? '#ffffff'),
      },
    })

    res.json({ clientSecret: paymentIntent.client_secret })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    res.status(500).json({ error: message })
  }
}
