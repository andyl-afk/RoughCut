import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'

// Fake source URLs for Phase 1 UI mockup
const MOCK_ZOOM_URL = ''
const MOCK_STAGE_URL = ''

function msToTimecode(ms: number): string {
  const abs = Math.abs(ms)
  const sign = ms < 0 ? '-' : '+'
  const s = Math.floor(abs / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  const msRem = abs % 1000
  return `${sign}${m}:${rem.toString().padStart(2, '0')}.${Math.floor(msRem / 100)}`
}

export default function SyncPage() {
  const { activeProject, setActiveProject } = useProject()
  const navigate = useNavigate()

  const [offsetMs, setOffsetMs] = useState(activeProject?.sync_offset_ms ?? 0)
  const [saved, setSaved] = useState(false)

  function nudge(deltaMs: number) {
    setOffsetMs(prev => prev + deltaMs)
    setSaved(false)
  }

  function saveOffset() {
    if (!activeProject) return
    setActiveProject({ ...activeProject, sync_offset_ms: offsetMs })
    setSaved(true)
  }

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
      <div className="page-title">Sync</div>
      <div className="page-subtitle">
        Align the stage camera to the Zoom recording. Zoom is the anchor — nudge the stage offset until the two sources line up.
      </div>

      <div className="mock-banner">
        ⚠ Phase 1 — video previews are placeholders. Real sync UI with HTML5 players ships in Phase 3.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Zoom (master)</div>
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 4,
              aspectRatio: '16/9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              fontSize: 12,
            }}
          >
            {MOCK_ZOOM_URL
              ? <video src={MOCK_ZOOM_URL} controls style={{ width: '100%', borderRadius: 4 }} />
              : 'Video preview — available after ingest'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 8 }}>Offset: 0 ms (anchor)</div>
        </div>

        <div className="card">
          <div className="card-title">Stage Camera</div>
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 4,
              aspectRatio: '16/9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              fontSize: 12,
            }}
          >
            {MOCK_STAGE_URL
              ? <video src={MOCK_STAGE_URL} controls style={{ width: '100%', borderRadius: 4 }} />
              : 'Video preview — available after ingest'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--accent-hi)', marginTop: 8 }}>
            Offset: {msToTimecode(offsetMs)} ({offsetMs > 0 ? 'stage starts later' : offsetMs < 0 ? 'stage starts earlier' : 'in sync'})
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Sync Offset Controls</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Positive offset = stage camera clip starts later than Zoom. Negative = stage starts earlier.
          Nudge until a known on-screen event (e.g. speaker walks on stage) aligns in both windows.
        </div>

        <div style={{ textAlign: 'center', fontSize: 28, fontVariantNumeric: 'tabular-nums', marginBottom: 20, color: 'var(--accent-hi)' }}>
          {msToTimecode(offsetMs)}
        </div>

        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
          <button className="ghost" onClick={() => nudge(-10000)}>−10 s</button>
          <button className="ghost" onClick={() => nudge(-1000)}>−1 s</button>
          <button className="ghost" onClick={() => nudge(-33)}>−1 frame</button>
          <button className="secondary" onClick={() => { setOffsetMs(0); setSaved(false) }}>Reset</button>
          <button className="ghost" onClick={() => nudge(33)}>+1 frame</button>
          <button className="ghost" onClick={() => nudge(1000)}>+1 s</button>
          <button className="ghost" onClick={() => nudge(10000)}>+10 s</button>
        </div>

        <div className="form-row" style={{ marginTop: 20 }}>
          <label>Manual offset (ms)</label>
          <input
            type="number"
            value={offsetMs}
            onChange={e => { setOffsetMs(Number(e.target.value)); setSaved(false) }}
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          {saved && <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Saved</span>}
          <button onClick={saveOffset}>Save Offset</button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div className="spacer" />
        <button onClick={() => navigate('/transcript')}>Continue to Transcript →</button>
      </div>
    </>
  )
}
