// Edge Function: get-transcription-status
// Purpose: Return the current status of a transcript from our DB.
//          (Deepgram pre-recorded is synchronous — this is mainly for the
//          polling contract; it reads our transcripts table, not Deepgram directly.)
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { transcript_id } = await req.json()

    if (!transcript_id) {
      return corsResponse({ error: 'transcript_id is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase
      .from('transcripts')
      .select('id, status')
      .eq('id', transcript_id)
      .single()

    if (error) return corsResponse({ error: error.message }, 500)

    const { count } = await supabase
      .from('transcript_segments')
      .select('id', { count: 'exact', head: true })
      .eq('transcript_id', transcript_id)

    return corsResponse({
      transcript_id: data.id,
      status: data.status,
      segments_count: count ?? 0,
    })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
