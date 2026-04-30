import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'
import type { TranscriptSegment } from '@/types'

// ─── Mock transcript data ──────────────────────────────────────────────────────
const MOCK_SEGMENTS: TranscriptSegment[] = [
  { id: 's1', transcript_id: 't1', start_ms: 0,      end_ms: 8200,  speaker: 'Host',     text: "Welcome everyone to our April webinar. Today we're going to walk through the Q2 roadmap and answer your questions live.",       confidence: 0.98, sort_order: 0 },
  { id: 's2', transcript_id: 't1', start_ms: 8200,   end_ms: 19500, speaker: 'Host',     text: "We have a really exciting lineup. First we'll cover the new editor improvements, then move into the API changes, and finally open up for Q&A.",  confidence: 0.97, sort_order: 1 },
  { id: 's3', transcript_id: 't1', start_ms: 19500,  end_ms: 35800, speaker: 'Host',     text: "Let me kick off with the editor. We heard loud and clear that the timeline was confusing. So we redesigned the entire left panel.",              confidence: 0.96, sort_order: 2 },
  { id: 's4', transcript_id: 't1', start_ms: 35800,  end_ms: 52000, speaker: 'Guest',    text: "Thanks. What I can add here is that we tested five different layouts in beta, and the current design scored thirty percent higher on usability benchmarks.", confidence: 0.95, sort_order: 3 },
  { id: 's5', transcript_id: 't1', start_ms: 52000,  end_ms: 68400, speaker: 'Host',     text: "Exactly. And that feeds into the API story. We're deprecating v1 endpoints in July. The migration guide is already up on our docs site.",          confidence: 0.98, sort_order: 4 },
  { id: 's6', transcript_id: 't1', start_ms: 68400,  end_ms: 89200, speaker: 'Attendee', text: "Question from the chat — will existing integrations break automatically on July first or is there a grace period?",                              confidence: 0.92, sort_order: 5 },
  { id: 's7', transcript_id: 't1', start_ms: 89200,  end_ms: 110000,speaker: 'Host',     text: "Great question. There's a 30-day grace period through July. You'll get deprecation warnings in the response headers starting June first.",           confidence: 0.97, sort_order: 6 },
  { id: 's8', transcript_id: 't1', start_ms: 110000, end_ms: 135000,speaker: 'Guest',    text: "We're also shipping a migration CLI tool next week. You point it at your codebase and it flags every v1 call and suggests the v2 equivalent.",       confidence: 0.96, sort_order: 7 },
  { id: 's9', transcript_id: 't1', start_ms: 135000, end_ms: 158000,speaker: 'Host',     text: "Alright, let's jump into Q&A. We have about fifteen minutes. I can see a lot of great questions coming in. Fire away.",                             confidence: 0.99, sort_order: 8 },
]

function msToTimecode(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

type TranscriptViewStatus = 'idle' | 'starting' | 'processing' | 'ready'

export default function TranscriptPage() {
  const { activeProject } = useProject()
  const navigate = useNavigate()

  const [status, setStatus] = useState<TranscriptViewStatus>('idle')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  function startTranscription() {
    setStatus('starting')
    setTimeout(() => setStatus('processing'), 800)
    setTimeout(() => {
      setStatus('ready')
      setSegments(MOCK_SEGMENTS)
    }, 3200)
  }

  const filtered = segments.filter(seg =>
    !searchQuery || seg.text.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!activeProject) {
    return (
      <div className="empty-state">
        <h3>No project selected</h3>
        <p>Go back to Projects and open a project first.</p>
        <button onClick={() => navigate('/projects')}>← Projects</button>
      </div>
    )
  }

  return (
    <>
      <div className="page-title">Transcript</div>
      <div className="page-subtitle">
        Transcribes only the Zoom recording. Speaker-labeled segments are stored and used to generate highlight candidates.
      </div>

      <div className="mock-banner">
        ⚠ Phase 1 — transcription is simulated with mock data. Deepgram integration ships in Phase 4.
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="row">
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Transcription Status</div>
            <span className={`pill ${status === 'ready' ? 'ready' : status === 'processing' || status === 'starting' ? 'processing' : 'pending'}`}>
              {status}
            </span>
          </div>
          <div className="spacer" />
          {status === 'idle' && (
            <button onClick={startTranscription}>Start Transcription →</button>
          )}
          {(status === 'starting' || status === 'processing') && (
            <button disabled>Transcribing…</button>
          )}
        </div>
        {(status === 'starting' || status === 'processing') && (
          <div style={{ marginTop: 12 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: status === 'processing' ? '65%' : '15%' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              {status === 'starting' ? 'Submitting to Deepgram…' : 'Processing audio…'}
            </div>
          </div>
        )}
      </div>

      {status === 'ready' && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <input
              placeholder="Search transcript…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: 300 }}
            />
            <div className="spacer" />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {filtered.length} segments
            </span>
          </div>

          <div className="card">
            {filtered.map(seg => (
              <div className="transcript-segment" key={seg.id}>
                <div className="segment-time">{msToTimecode(seg.start_ms)}</div>
                {seg.speaker && <div className="segment-speaker">{seg.speaker}</div>}
                <div style={{ flex: 1 }}>{seg.text}</div>
                {seg.confidence !== null && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                    {Math.round(seg.confidence * 100)}%
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <div className="spacer" />
            <button onClick={() => navigate('/highlights')}>Generate Highlights →</button>
          </div>
        </>
      )}
    </>
  )
}
