// Edge Function: create-shotstack-upload-url
// Purpose: Ask Shotstack for a signed upload URL for a local file.
//          Returns { upload_url, shotstack_source_id }.
// Called by: Import screen when user selects a local file.
// Secrets needed: SHOTSTACK_API_KEY (set in Supabase project secrets)

import { handleCors, corsResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { file_name, mime_type, size_bytes } = await req.json()

    if (!file_name || !mime_type) {
      return corsResponse({ error: 'file_name and mime_type are required' }, 400)
    }

    const apiKey = Deno.env.get('SHOTSTACK_API_KEY')
    if (!apiKey) {
      return corsResponse({ error: 'SHOTSTACK_API_KEY is not configured' }, 500)
    }

    // POST to Shotstack ingest sources endpoint to get a signed upload URL
    const res = await fetch('https://api.shotstack.io/ingest/v1/sources', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: null,   // null signals "upload" mode — Shotstack returns an upload URL
        outputs: {}, // no auto-renditions in v1
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return corsResponse({ error: `Shotstack error: ${res.status} — ${text}` }, 502)
    }

    const data = await res.json()

    // Shotstack ingest response shape (upload mode):
    // { data: { id, attributes: { upload: { url, ... } } } }
    const shotstackSourceId = data?.data?.id
    const uploadUrl = data?.data?.attributes?.upload?.url

    if (!shotstackSourceId || !uploadUrl) {
      return corsResponse({ error: 'Unexpected Shotstack response shape', raw: data }, 502)
    }

    return corsResponse({ upload_url: uploadUrl, shotstack_source_id: shotstackSourceId })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
