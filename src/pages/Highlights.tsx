import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'
import type { HighlightCandidate, AnglePreference } from '@/types'

// ─── Mock highlight candidates ─────────────────────────────────────────────────
const MOCK_CANDIDATES: HighlightCandidate[] = [
  {
    id: 'h1', project_id: 'mock-1', source: 'claude',
    title: 'New editor timeline redesign',
    reason: 'Core product update — high relevance to existing users.',
    start_ms: 19500, end_ms: 52000, score: 0.92,
    excerpt: '"We redesigned the entire left panel…scored thirty percent higher on usability benchmarks."',
    status: 'pending', angle_preference: 'zoom', sort_order: 0,
    raw_response: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'h2', project_id: 'mock-1', source: 'claude',
    title: 'API v1 deprecation announcement',
    reason: 'Critical notice for all developers using the API.',
    start_ms: 52000, end_ms: 89200, score: 0.88,
    excerpt: '"We\'re deprecating v1 endpoints in July. The migration guide is already up."',
    status: 'pending', angle_preference: 'zoom', sort_order: 1,
    raw_response: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'h3', project_id: 'mock-1', source: 'claude',
    title: 'Grace period clarification',
    reason: 'Directly addresses a common attendee concern about breaking changes.',
    start_ms: 68400, end_ms: 110000, score: 0.84,
    excerpt: '"There\'s a 30-day grace period through July. You\'ll get deprecation warnings in response headers."',
    status: 'pending', angle_preference: 'zoom', sort_order: 2,
    raw_response: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'h4', project_id: 'mock-1', source: 'claude',
    title: 'Migration CLI tool announcement',
    reason: 'Practical tool announcement with high engagement value.',
    start_ms: 110000, end_ms: 135000, score: 0.79,
    excerpt: '"We\'re shipping a migration CLI tool next week — it flags every v1 call and suggests the v2 equivalent."',
    status: 'pending', angle_preference: 'stage', sort_order: 3,
    raw_response: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
]

function msToTimecode(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

function durationLabel(startMs: number, endMs: number): string {
  const secs = Math.round((endMs - startMs) / 1000)
  return `${secs}s`
}

type GenerateStatus = 'idle' | 'generating' | 'ready'

export default function HighlightsPage() {
  const { activeProject } = useProject()
  const navigate = useNavigate()

  const [genStatus, setGenStatus] = useState<GenerateStatus>('idle')
  const [candidates, setCandidates] = useState<HighlightCandidate[]>([])

  function generateHighlights() {
    setGenStatus('generating')
    setTimeout(() => {
      setGenStatus('ready')
      setCandidates(MOCK_CANDIDATES)
    }, 2800)
  }

  function setStatus(id: string, status: HighlightCandidate['status']) {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  function setAngle(id: string, angle: AnglePreference) {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, angle_preference: angle } : c))
  }

  function updateTrim(id: string, field: 'start_ms' | 'end_ms', value: number) {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  function moveUp(id: string) {
    setCandidates(prev => {
      const i = prev.findIndex(c => c.id === id)
      if (i <= 0) return prev
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next.map((c, idx) => ({ ...c, sort_order: idx }))
    })
  }

  function moveDown(id: string) {
    setCandidates(prev => {
      const i = prev.findIndex(c => c.id === id)
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next.map((c, idx) => ({ ...c, sort_order: idx }))
    })
  }

  const approvedCount = candidates.filter(c => c.status === 'approved').length

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
      <div className="page-title">Highlights</div>
      <div className="page-subtitle">
        Claude analyses the transcript and your recap brief to suggest highlight candidates.
        Approve, reject, reorder, trim, and choose the camera angle for each.
      </div>

      <div className="mock-banner">
        ⚠ Phase 1 — Claude highlight generation is simulated. Real Anthropic API integration ships in Phase 5.
      </div>

      {genStatus === 'idle' && (
        <div className="card">
          <div className="card-title">Generate Highlights</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            Claude will read your recap brief and the full transcript to suggest 8–15 highlight segments.
          </div>
          <button onClick={generateHighlights}>Ask Claude for Highlights →</button>
        </div>
      )}

      {genStatus === 'generating' && (
        <div className="card">
          <div className="card-title">Generating…</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '55%' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Sending transcript to Anthropic Claude…
          </div>
        </div>
      )}

      {genStatus === 'ready' && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{candidates.length}</strong> candidates ·{' '}
              <span style={{ color: 'var(--success)' }}>{approvedCount} approved</span>
            </div>
            <div className="spacer" />
            <button
              className="secondary"
              onClick={() => setCandidates(prev => prev.map(c => ({ ...c, status: 'approved' })))}
            >
              Approve All
            </button>
          </div>

          {candidates.map((c, i) => (
            <div className={`highlight-card ${c.status}`} key={c.id}>
              <div>
                <div className="highlight-title">{c.title}</div>
                <div className="highlight-meta">
                  {msToTimecode(c.start_ms)} – {msToTimecode(c.end_ms)} · {durationLabel(c.start_ms, c.end_ms)} ·{' '}
                  Score: {c.score !== null ? Math.round(c.score * 100) : '—'}
                </div>
                <div className="highlight-excerpt">{c.excerpt}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{c.reason}</div>

                {/* Trim controls */}
                {c.status === 'approved' && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <label>Start (ms)</label>
                      <input
                        type="number"
                        style={{ width: 90 }}
                        value={c.start_ms}
                        onChange={e => updateTrim(c.id, 'start_ms', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label>End (ms)</label>
                      <input
                        type="number"
                        style={{ width: 90 }}
                        value={c.end_ms}
                        onChange={e => updateTrim(c.id, 'end_ms', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label>Camera angle</label>
                      <select
                        style={{ width: 'auto' }}
                        value={c.angle_preference}
                        onChange={e => setAngle(c.id, e.target.value as AnglePreference)}
                      >
                        <option value="zoom">Zoom</option>
                        <option value="stage">Stage Wide</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="highlight-actions">
                <span className={`pill ${c.status}`}>{c.status}</span>

                <div className="row" style={{ gap: 4 }}>
                  <button
                    className="ghost"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    disabled={i === 0}
                    onClick={() => moveUp(c.id)}
                  >↑</button>
                  <button
                    className="ghost"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    disabled={i === candidates.length - 1}
                    onClick={() => moveDown(c.id)}
                  >↓</button>
                </div>

                {c.status !== 'approved' && (
                  <button onClick={() => setStatus(c.id, 'approved')} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Approve
                  </button>
                )}
                {c.status !== 'rejected' && (
                  <button className="danger" onClick={() => setStatus(c.id, 'rejected')} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Reject
                  </button>
                )}
                {c.status === 'rejected' && (
                  <button className="secondary" onClick={() => setStatus(c.id, 'pending')} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="row" style={{ marginTop: 16 }}>
            <div className="spacer" />
            <button disabled={approvedCount === 0} onClick={() => navigate('/render')}>
              {approvedCount} approved — Build Render →
            </button>
          </div>
        </>
      )}
    </>
  )
}
