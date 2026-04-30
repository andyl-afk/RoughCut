// Edge Function: create-render
// Purpose: Build a Shotstack timeline JSON from approved highlight_candidates,
//          submit it for rendering, and create a render_jobs row.
// Returns: { render_job_id, provider_job_id }
// Secrets needed: SHOTSTACK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, corsResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { project_id } = await req.json()

    if (!project_id) {
      return corsResponse({ error: 'project_id is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Load approved highlights (ordered)
    const { data: highlights, error: hErr } = await supabase
      .from('highlight_candidates')
      .select('*')
      .eq('project_id', project_id)
      .eq('status', 'approved')
      .order('sort_order')
    if (hErr) return corsResponse({ error: hErr.message }, 500)

    if (!highlights || highlights.length === 0) {
      return corsResponse({ error: 'No approved highlights found' }, 400)
    }

    // Load assets to get canonical source URLs
    const { data: assets, error: aErr } = await supabase
      .from('assets')
      .select('role, shotstack_source_url, sync_offset_ms')
      .eq('project_id', project_id)
      .in('role', ['zoom_master', 'stage_wide_mezzanine'])
    if (aErr) return corsResponse({ error: aErr.message }, 500)

    const { data: project } = await supabase
      .from('projects')
      .select('sync_offset_ms')
      .eq('id', project_id)
      .single()

    const syncOffsetMs: number = project?.sync_offset_ms ?? 0

    const zoomAsset = assets?.find((a: { role: string }) => a.role === 'zoom_master')
    const stageAsset = assets?.find((a: { role: string }) => a.role === 'stage_wide_mezzanine')

    const zoomUrl: string = zoomAsset?.shotstack_source_url ?? ''
    const stageUrl: string = stageAsset?.shotstack_source_url ?? ''

    // Build Shotstack timeline
    // Zoom carries the audio throughout. Each approved highlight is a clip on the video track.
    // Stage clips include a time offset.
    let timelineCursor = 0  // seconds from start of render output

    const videoClips: unknown[] = []
    const audioClips: unknown[] = []

    for (const h of highlights) {
      const startSec = h.start_ms / 1000
      const endSec = h.end_ms / 1000
      const duration = endSec - startSec

      if (h.angle_preference === 'stage' && stageUrl) {
        // Stage clip: apply sync offset
        const stageStart = startSec + syncOffsetMs / 1000
        videoClips.push({
          asset: { type: 'video', src: stageUrl, trim: stageStart, volume: 0 },
          start: timelineCursor,
          length: duration,
        })
      } else {
        // Default: Zoom video
        videoClips.push({
          asset: { type: 'video', src: zoomUrl, trim: startSec, volume: 0 },
          start: timelineCursor,
          length: duration,
        })
      }

      // Always use Zoom audio
      audioClips.push({
        asset: { type: 'video', src: zoomUrl, trim: startSec },
        start: timelineCursor,
        length: duration,
      })

      timelineCursor += duration
    }

    const timelineJson = {
      timeline: {
        background: '#000000',
        tracks: [
          { clips: videoClips },
          { clips: audioClips },
        ],
      },
      output: {
        format: 'mp4',
        resolution: 'hd',
        aspectRatio: '16:9',
      },
    }

    const apiKey = Deno.env.get('SHOTSTACK_API_KEY')
    if (!apiKey) return corsResponse({ error: 'SHOTSTACK_API_KEY not configured' }, 500)

    // Submit to Shotstack render
    const renderRes = await fetch('https://api.shotstack.io/edit/v1/render', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(timelineJson),
    })

    if (!renderRes.ok) {
      const text = await renderRes.text()
      return corsResponse({ error: `Shotstack render error: ${renderRes.status} — ${text}` }, 502)
    }

    const renderData = await renderRes.json()
    const providerJobId: string = renderData?.response?.id ?? null

    // Create render_jobs row
    const { data: renderRow, error: rErr } = await supabase
      .from('render_jobs')
      .insert({
        project_id,
        provider: 'shotstack',
        provider_job_id: providerJobId,
        status: 'queued',
        timeline_json: timelineJson,
      })
      .select('id')
      .single()

    if (rErr) return corsResponse({ error: rErr.message }, 500)

    return corsResponse({ render_job_id: renderRow.id, provider_job_id: providerJobId })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
