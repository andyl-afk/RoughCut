import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'
import type { RenderStatus } from '@/types'

type RenderViewStatus = 'idle' | 'building' | 'queued' | 'rendering' | 'done' | 'failed'

const STATUS_LABELS: Record<RenderViewStatus, string> = {
  idle:      'Not started',
  building:  'Building timeline JSON…',
  queued:    'Queued in Shotstack',
  rendering: 'Rendering…',
  done:      'Done',
  failed:    'Failed',
}

const RENDER_STEPS: RenderViewStatus[] = ['building', 'queued', 'rendering', 'done']

export default function RenderPage() {
  const { activeProject } = useProject()
  const navigate = useNavigate()

  const [renderStatus, setRenderStatus] = useState<RenderViewStatus>('idle')
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [timelinePreview, setTimelinePreview] = useState<string | null>(null)

  function startRender() {
    const mockTimeline = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'video', src: '[zoom-source-url]' }, start: 0, length: 32.5 }] },
          { clips: [{ asset: { type: 'video', src: '[stage-source-url]' }, start: 58, length: 21.8 }] },
        ],
      },
      output: { format: 'mp4', resolution: 'hd' },
    }
    setTimelinePreview(JSON.stringify(mockTimeline, null, 2))

    let stepIdx = 0
    setRenderStatus(RENDER_STEPS[0])

    const advance = () => {
      stepIdx++
      if (stepIdx >= RENDER_STEPS.length) {
        setOutputUrl('https://cdn.shotstack.io/au/stage/mock-output-12345.mp4')
        return
      }
      const delay = stepIdx === 2 ? 4000 : 1500
      setRenderStatus(RENDER_STEPS[stepIdx])
      setTimeout(advance, delay)
    }

    setTimeout(advance, 1200)
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

  const isRunning = renderStatus === 'building' || renderStatus === 'queued' || renderStatus === 'rendering'
  const isDone = renderStatus === 'done'

  return (
    <>
      <div className="page-title">Render</div>
      <div className="page-subtitle">
        Builds a Shotstack timeline from your approved highlights and renders a WIP MP4.
        Hard cuts only in v1. Zoom audio is used throughout.
      </div>

      <div className="mock-banner">
        ⚠ Phase 1 — render is simulated. Real Shotstack timeline + render ships in Phase 6.
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row" style={{ marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Render Status</div>
            <span className={`pill ${isDone ? 'ready' : renderStatus === 'failed' ? 'error' : isRunning ? 'processing' : 'pending'}`}>
              {STATUS_LABELS[renderStatus]}
            </span>
          </div>
          <div className="spacer" />
          {renderStatus === 'idle' && (
            <button onClick={startRender}>Start Render →</button>
          )}
          {isRunning && (
            <button disabled>Rendering…</button>
          )}
          {isDone && (
            <button className="secondary" onClick={() => { setRenderStatus('idle'); setOutputUrl(null); setTimelinePreview(null) }}>
              Re-render
            </button>
          )}
        </div>

        {isRunning && (
          <div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: renderStatus === 'building' ? '15%' : renderStatus === 'queued' ? '35%' : '70%',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              {STATUS_LABELS[renderStatus]}
            </div>
          </div>
        )}

        {isDone && outputUrl && (
          <div>
            <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 16 }}>
              ✓ Render complete! Your WIP MP4 is ready.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href={outputUrl} download="roughcut-wip.mp4">
                <button>⬇ Download WIP MP4</button>
              </a>
              <a href={outputUrl} target="_blank" rel="noreferrer">
                <button className="secondary">Preview in Browser</button>
              </a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              Output: {outputUrl}
            </div>
          </div>
        )}
      </div>

      {timelinePreview && (
        <div className="card">
          <div className="card-title">Timeline JSON (saved to DB)</div>
          <pre
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              overflowX: 'auto',
              padding: '12px',
              background: 'var(--bg)',
              borderRadius: 4,
              lineHeight: 1.6,
            }}
          >
            {timelinePreview}
          </pre>
        </div>
      )}

      <div className="card" style={{ marginTop: 0 }}>
        <div className="card-title">Render Settings (v1 defaults)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12 }}>
          <div>
            <div style={{ color: 'var(--muted)' }}>Output format</div>
            <div>MP4 (H.264)</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)' }}>Resolution</div>
            <div>1920×1080 (HD)</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)' }}>Transitions</div>
            <div>Hard cuts only</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)' }}>Audio</div>
            <div>Zoom master track throughout</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)' }}>Intro / end card</div>
            <div style={{ color: 'var(--muted)' }}>Not in v1</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)' }}>Lower thirds</div>
            <div style={{ color: 'var(--muted)' }}>Not in v1</div>
          </div>
        </div>
      </div>
    </>
  )
}
