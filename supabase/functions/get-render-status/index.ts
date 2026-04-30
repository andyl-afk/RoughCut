// Edge Function: get-render-status
// Purpose: Poll Shotstack for render status and update the render_jobs row.
//          Returns { render_job_id, status, output_url, error_message }.
// Secrets needed: SHOTSTACK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsResponse } from '../_shared/cors.ts'

const STATUS_MAP: Record<string, string> = {
  queued:    'queued',
  fetching:  'fetching',
  rendering: 'rendering',
  saving:    'saving',
  done:      'done',
  failed:    'failed',
}

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { render_job_id } = await req.json()

    if (!render_job_id) {
      return corsResponse({ error: 'render_job_id is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Load render job
    const { data: job, error: jErr } = await supabase
      .from('render_jobs')
      .select('provider_job_id, status, output_url')
      .eq('id', render_job_id)
      .single()
    if (jErr) return corsResponse({ error: jErr.message }, 500)

    // If already done or failed, return cached state
    if (job.status === 'done' || job.status === 'failed') {
      return corsResponse({
        render_job_id,
        status: job.status,
        output_url: job.output_url,
        error_message: null,
      })
    }

    const apiKey = Deno.env.get('SHOTSTACK_API_KEY')
    if (!apiKey) return corsResponse({ error: 'SHOTSTACK_API_KEY not configured' }, 500)

    // Poll Shotstack
    const res = await fetch(
      `https://api.shotstack.io/edit/v1/render/${job.provider_job_id}`,
      { headers: { 'x-api-key': apiKey } }
    )

    if (!res.ok) {
      const text = await res.text()
      return corsResponse({ error: `Shotstack error: ${res.status} — ${text}` }, 502)
    }

    const data = await res.json()
    const attrs = data?.response

    const rawStatus: string = attrs?.status ?? 'queued'
    const mappedStatus = STATUS_MAP[rawStatus] ?? 'queued'
    const outputUrl: string | null = attrs?.url ?? null
    const errorMsg: string | null = attrs?.error ?? null

    // Update DB
    await supabase
      .from('render_jobs')
      .update({
        status: mappedStatus,
        output_url: outputUrl,
        error_message: errorMsg,
      })
      .eq('id', render_job_id)

    return corsResponse({
      render_job_id,
      status: mappedStatus,
      output_url: outputUrl,
      error_message: errorMsg,
    })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
