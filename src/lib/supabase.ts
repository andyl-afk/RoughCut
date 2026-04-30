import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your values.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Typed helper: call a Supabase Edge Function ─────────────────────────────
export async function callEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) throw new Error(`Edge function "${name}" failed: ${error.message}`)
  if (data === null) throw new Error(`Edge function "${name}" returned null`)
  return data
}
