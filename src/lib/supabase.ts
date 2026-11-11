import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * null when the build has no Supabase settings (e.g. a preview deploy without
 * env vars). Callers show "couldn't reach the wall" instead of the whole app
 * crashing on load.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

if (!supabase) console.error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
