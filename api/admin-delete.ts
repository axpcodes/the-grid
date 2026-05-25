import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password, mode, ids } = req.body

  // Server-side password check
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' })
  }

  try {
    if (mode === 'all') {
      // Delete every row in the table
      const { error } = await supabase.from('cells').delete().neq('id', '')
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ deleted: 'all' })
    }

    if (mode === 'ids' && Array.isArray(ids) && ids.length > 0) {
      const { error } = await supabase.from('cells').delete().in('id', ids)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ deleted: ids.length })
    }

    return res.status(400).json({ error: 'Invalid mode or missing ids' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return res.status(500).json({ error: message })
  }
}
