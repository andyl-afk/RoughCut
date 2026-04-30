// Edge Function: generate-highlights
// Purpose: Send the recap brief + transcript segments to Anthropic Claude
//          and store the resulting highlight candidates.
// Returns: { candidates_created: number }
// Secrets needed: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.27.3'
import { handleCors, corsResponse } from '../_shared/cors.ts'

interface HighlightCandidate {
  title: string
  reason: string
  start_ms: number
  end_ms: number
  score: number
  excerpt: string
}

Deno.serve(async (req) => {
  const early = handleCors(req)
  if (early) return early

  try {
    const { project_id, transcript_id } = await req.json()

    if (!project_id || !transcript_id) {
      return corsResponse({ error: 'project_id and transcript_id are required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Load project (for recap brief)
    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('recap_brief, target_runtime_seconds')
      .eq('id', project_id)
      .single()
    if (pErr) return corsResponse({ error: pErr.message }, 500)

    // Load transcript segments
    const { data: segments, error: sErr } = await supabase
      .from('transcript_segments')
      .select('start_ms, end_ms, speaker, text, sort_order')
      .eq('transcript_id', transcript_id)
      .order('sort_order')
    if (sErr) return corsResponse({ error: sErr.message }, 500)

    if (!segments || segments.length === 0) {
      return corsResponse({ error: 'No transcript segments found' }, 400)
    }

    const brief = project.recap_brief ?? {}
    const targetSecs = project.target_runtime_seconds ?? 300

    // Build prompt
    const segmentText = segments
      .map((s: { start_ms: number; end_ms: number; speaker?: string; text: string }) =>
        `[${s.start_ms}ms–${s.end_ms}ms]${s.speaker ? ` ${s.speaker}:` : ''} ${s.text}`
      )
      .join('\n')

    const systemPrompt = `You are a video editor helping build a ${Math.round(targetSecs / 60)}-minute webinar recap.
Your job is to identify the most compelling highlight segments from the transcript.
You must return ONLY valid JSON — no prose, no markdown fences.`

    const userPrompt = `RECAP BRIEF:
- Desired outcome: ${brief.desired_outcome ?? 'Not specified'}
- Topics to emphasise: ${(brief.topics_to_emphasize ?? []).join(', ') || 'None'}
- Topics to avoid: ${(brief.topics_to_avoid ?? []).join(', ') || 'None'}
- CTA / outro: ${brief.cta_outro_text ?? 'None'}

TRANSCRIPT (timestamped segments, start_ms and end_ms are milliseconds from start of Zoom recording):
${segmentText}

Return a JSON array of 8–15 highlight candidates. Each object must have:
{
  "title": "short descriptive title",
  "reason": "why this segment is valuable for the recap",
  "start_ms": <integer — must match a segment start_ms>,
  "end_ms": <integer — must match a segment end_ms>,
  "score": <float 0.0–1.0, higher = more important>,
  "excerpt": "verbatim quote or paraphrase from the transcript"
}

Rules:
- start_ms and end_ms must be taken directly from the transcript timestamps above. Do NOT invent timestamps.
- You may combine consecutive segments by using the start_ms of the first and end_ms of the last.
- Sort by score descending.
- Return ONLY the JSON array. No other text.`

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const rawText = (message.content[0] as { text: string }).text.trim()

    let candidates: HighlightCandidate[]
    try {
      candidates = JSON.parse(rawText)
      if (!Array.isArray(candidates)) throw new Error('Response is not an array')
    } catch {
      // Try to extract JSON array from response
      const match = rawText.match(/\[[\s\S]*\]/)
      if (!match) {
        return corsResponse({ error: 'Claude did not return valid JSON', raw: rawText }, 502)
      }
      candidates = JSON.parse(match[0])
    }

    // Validate and insert
    const rows = candidates
      .filter((c: HighlightCandidate) =>
        c.title && c.reason && typeof c.start_ms === 'number' && typeof c.end_ms === 'number'
      )
      .map((c: HighlightCandidate, i: number) => ({
        project_id,
        source: 'claude',
        title: c.title,
        reason: c.reason,
        start_ms: c.start_ms,
        end_ms: c.end_ms,
        score: c.score ?? null,
        excerpt: c.excerpt ?? '',
        status: 'pending',
        angle_preference: 'zoom',
        sort_order: i,
        raw_response: { message_id: message.id },
      }))

    const { error: insErr } = await supabase.from('highlight_candidates').insert(rows)
    if (insErr) return corsResponse({ error: insErr.message }, 500)

    return corsResponse({ candidates_created: rows.length })
  } catch (err) {
    return corsResponse({ error: (err as Error).message }, 500)
  }
})
