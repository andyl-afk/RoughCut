// Edge Function: get-shotstack-source-status
// Purpose: Poll a Shotstack ingest source for readiness.
//          When ready, returns the canonical source URL + video metadata.
// Called by: Import screen polling loop.
// Secrets needed: SHOTSTACK_API_KEY

import { handleCors, corsResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { shotstack_source_id } = await req.json()

    if (!shotstack_source_id) {
      return corsResponse({ error: 'shotstack_source_id is required' }, 400)
    }

    const apiKey = Deno.env.get('SHOTSTACK_API_KEY')
    if (!apiKey) {
      return corsResponse({ error: 'SHOTSTACK_API_KEY is not configured' }, 500)
    }

    const res = await fetch(
      `https://api.shotstack.io/ingest/v1/sources/${shotstack_source_id}`,
      { headers: { 'x-api-key': apiKey } }
    )

    if (!res.ok) {
      const text = await res.text()
      return corsResponse({ error: `Shotstack error: ${res.status} — ${text}` }, 502)
    }

    const data = await res.json()
    const attrs = data?.data?.attributes

    // Map Shotstack status → our ingest_status enum
    const shotstackStatus: string = attrs?.status ?? 'unknown'
    const statusMap: Record<string, string> = {
      importing: 'processing',
      ready:     'ready',
      failed:    'error',
    }
    const ingestStatus = statusMap[shotstackStatus] ?? 'processing'

    const url: string | null = attrs?.source ?? null
    const duration: number | null = attrs?.duration ?? null
    const width: number | null = attrs?.width ?? null
    const height: number | null = attrs?.height ?? null
    const fps: number | null = attrs?.fps ?? null

    return corsResponse({
      shotstack_source_id,
      status: ingestStatus,
      url,
      duration_seconds: duration,
      width,
      height,
      fps,
    })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
