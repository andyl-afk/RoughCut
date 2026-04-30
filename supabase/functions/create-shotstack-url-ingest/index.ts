// Edge Function: create-shotstack-url-ingest
// Purpose: Submit a publicly-accessible URL (e.g. Google Drive direct download)
//          to Shotstack ingest. Returns { shotstack_source_id }.
// Called by: Import screen when user picks a file from Google Drive.
// Secrets needed: SHOTSTACK_API_KEY

import { handleCors, corsResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { source_url, asset_id } = await req.json()

    if (!source_url) {
      return corsResponse({ error: 'source_url is required' }, 400)
    }

    const apiKey = Deno.env.get('SHOTSTACK_API_KEY')
    if (!apiKey) {
      return corsResponse({ error: 'SHOTSTACK_API_KEY is not configured' }, 500)
    }

    const res = await fetch('https://api.shotstack.io/ingest/v1/sources', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: source_url }),
    })

    if (!res.ok) {
      const text = await res.text()
      return corsResponse({ error: `Shotstack error: ${res.status} — ${text}` }, 502)
    }

    const data = await res.json()
    const shotstackSourceId = data?.data?.id

    if (!shotstackSourceId) {
      return corsResponse({ error: 'Unexpected Shotstack response shape', raw: data }, 502)
    }

    // Caller should update assets row: shotstack_source_id = shotstackSourceId, ingest_status = 'submitted'
    return corsResponse({ shotstack_source_id: shotstackSourceId, asset_id })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
