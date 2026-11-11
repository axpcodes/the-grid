import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // service role — bypasses RLS for trusted writes
)

const COLS = 1000, ROWS = 1000
const MAX_TEXT = 3000, MAX_NAME = 40, MAX_CONTACT = 100
const MAX_IMAGE_CHARS = 300_000   // client sends ≤512px JPEG, typically 30–120 KB
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

// Cloudflare's documented always-pass TEST secret — only ever used outside production.
const TEST_SECRET = '1x0000000000000000000000000000000AA'

function captchaSecret(): string | null {
  if (process.env.TURNSTILE_SECRET_KEY) return process.env.TURNSTILE_SECRET_KEY
  return process.env.VERCEL_ENV === 'production' ? null : TEST_SECRET
}

async function verifyCaptcha(secret: string, token: string, ip?: string): Promise<boolean> {
  if (!token) return false
  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.append('remoteip', ip)
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    const data = (await r.json()) as { success: boolean }
    return !!data.success
  } catch {
    return false
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = (req.body ?? {}) as Record<string, unknown>
  const row = Number(body.row), col = Number(body.col)
  const contentText = str(body.contentText)
  const ownerName   = str(body.ownerName)
  const contact     = str(body.contact)
  const imageUrl    = str(body.imageUrl)
  const bgColor     = COLOR_RE.test(str(body.bgColor)) ? str(body.bgColor) : '#ffffff'

  // Validate before spending the (single-use) captcha token
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= ROWS || col < 0 || col >= COLS) {
    return res.status(400).json({ error: 'That cell doesn’t exist.' })
  }
  if (!contentText && !imageUrl) {
    return res.status(400).json({ error: 'Write something or add a photo.' })
  }
  if (contentText.length > MAX_TEXT || ownerName.length > MAX_NAME || contact.length > MAX_CONTACT) {
    return res.status(400).json({ error: 'That’s a little too long.' })
  }
  if (imageUrl && (!IMAGE_RE.test(imageUrl) || imageUrl.length > MAX_IMAGE_CHARS)) {
    return res.status(400).json({ error: 'That photo couldn’t be used. Try a different one.' })
  }

  const secret = captchaSecret()
  if (!secret) {
    return res.status(503).json({ error: 'Claiming is paused for a moment. Please try again soon.' })
  }
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
  if (!(await verifyCaptcha(secret, str(body.captchaToken), ip))) {
    return res.status(403).json({ error: 'Couldn’t confirm you’re human. Please try again.' })
  }

  const id = `${row}:${col}`
  const { data: existing } = await supabase.from('cells').select('id').eq('id', id).maybeSingle()
  if (existing) return res.status(409).json({ error: 'Someone just claimed this square. Pick another one nearby.' })

  const { error } = await supabase.from('cells').insert({
    id,
    row_idx:           row,
    col_idx:           col,
    owner_name:        ownerName,
    content_text:      contentText,
    image_url:         imageUrl,
    contact,
    bg_color:          bgColor,
    stripe_payment_id: 'FREE',
  })

  if (error) {
    // Primary-key collision: someone got there first
    if (error.code === '23505') return res.status(409).json({ error: 'Someone just claimed this square. Pick another one nearby.' })
    console.error('claim insert failed', error)
    return res.status(500).json({ error: 'Something went wrong saving your square. Please try again.' })
  }

  res.json({ success: true })
}
