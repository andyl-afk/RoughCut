// Edge Function: start-transcription
// Purpose: Submit the Zoom source audio to Deepgram for transcription.
//          Creates a transcript row and returns { transcript_id, provider_job_id }.
// Called by: Transcript screen "Start Transcription" button.
// Secrets needed: DEEPGRAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { project_id, asset_id, source_url, language } = await req.json()

    if (!project_id || !asset_id || !source_url) {
      return corsResponse({ error: 'project_id, asset_id, and source_url are required' }, 400)
    }

    const deepgramKey = Deno.env.get('DEEPGRAM_API_KEY')
    if (!deepgramKey) {
      return corsResponse({ error: 'DEEPGRAM_API_KEY is not configured' }, 500)
    }

    // Submit to Deepgram pre-recorded transcription API
    const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: source_url }),
    })

    if (!dgRes.ok) {
      const text = await dgRes.text()
      return corsResponse({ error: `Deepgram error: ${dgRes.status} — ${text}` }, 502)
    }

    const dgData = await dgRes.json()

    // Deepgram pre-recorded returns the full transcript synchronously — no polling needed.
    // However the audio can be long, so we treat it as async for UI consistency.
    // In practice for v1 we store the raw response immediately and parse segments here.

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const fullText: string =
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

    const { data: transcriptRow, error: insertError } = await supabase
      .from('transcripts')
      .insert({
        project_id,
        asset_id,
        provider: 'deepgram',
        provider_job_id: dgData?.metadata?.request_id ?? null,
        status: 'processing',
        language: language ?? 'en',
        full_text: fullText,
        raw_response: dgData,
      })
      .select('id')
      .single()

    if (insertError) {
      return corsResponse({ error: insertError.message }, 500)
    }

    const transcriptId: string = transcriptRow.id

    // Parse and insert segments
    const words = dgData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? []
    // Group words into sentence-like segments (naive: split on gaps > 1.5s or 15 words)
    const segments: Array<{
      transcript_id: string
      start_ms: number
      end_ms: number
      speaker: string | null
      text: string
      confidence: number | null
      sort_order: number
    }> = []

    let buf: typeof words = []
    let order = 0

    const flush = () => {
      if (!buf.length) return
      const first = buf[0]
      const last = buf[buf.length - 1]
      segments.push({
        transcript_id: transcriptId,
        start_ms: Math.round(first.start * 1000),
        end_ms: Math.round(last.end * 1000),
        speaker: first.speaker !== undefined ? `Speaker ${first.speaker}` : null,
        text: buf.map((w: { punctuated_word?: string; word: string }) => w.punctuated_word ?? w.word).join(' '),
        confidence: first.confidence ?? null,
        sort_order: order++,
      })
      buf = []
    }

    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const next = words[i + 1]
      buf.push(w)
      const gap = next ? next.start - w.end : 999
      const speakerChange = next && next.speaker !== w.speaker
      if (buf.length >= 15 || gap > 1.5 || speakerChange) flush()
    }
    flush()

    if (segments.length > 0) {
      await supabase.from('transcript_segments').insert(segments)
    }

    // Mark transcript ready
    await supabase
      .from('transcripts')
      .update({ status: 'ready' })
      .eq('id', transcriptId)

    return corsResponse({ transcript_id: transcriptId, provider_job_id: dgData?.metadata?.request_id ?? null })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
