import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'
import type { Asset, IngestStatus } from '@/types'

type SourceType = 'drive' | 'local'

interface AssetSlot {
  role: 'zoom_master' | 'stage_wide_mezzanine'
  label: string
  description: string
  allowDrive: boolean
}

const SLOTS: AssetSlot[] = [
  {
    role: 'zoom_master',
    label: 'Zoom Recording',
    description: 'The full webinar recording from Zoom. This is the master source for timing and audio. Import from Google Drive or local disk.',
    allowDrive: true,
  },
  {
    role: 'stage_wide_mezzanine',
    label: 'Stage Camera Mezzanine',
    description: 'Your pre-compressed broadcast camera file (from HandBrake). Local disk only — these files are too large for Drive in v1.',
    allowDrive: false,
  },
]

// Fake asset state for Phase 1 mocks
interface MockAssetState {
  file: File | null
  sourceType: SourceType
  driveFileName: string
  status: IngestStatus
  progress: number
}

const INITIAL: MockAssetState = {
  file: null,
  sourceType: 'local',
  driveFileName: '',
  status: 'pending',
  progress: 0,
}

export default function ImportPage() {
  const { activeProject } = useProject()
  const navigate = useNavigate()

  const [zoom, setZoom] = useState<MockAssetState>({ ...INITIAL })
  const [stage, setStage] = useState<MockAssetState>({ ...INITIAL })

  function getSlotState(role: AssetSlot['role']) {
    return role === 'zoom_master' ? zoom : stage
  }
  function setSlotState(role: AssetSlot['role'], patch: Partial<MockAssetState>) {
    if (role === 'zoom_master') setZoom(prev => ({ ...prev, ...patch }))
    else setStage(prev => ({ ...prev, ...patch }))
  }

  function handleFileChange(role: AssetSlot['role'], e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) return
    setSlotState(role, { file, status: 'pending' })
  }

  function simulateIngest(role: AssetSlot['role']) {
    // Mock ingest: tick through statuses
    setSlotState(role, { status: 'uploading', progress: 10 })
    let p = 10
    const interval = setInterval(() => {
      p += Math.random() * 20
      if (p >= 100) {
        clearInterval(interval)
        setSlotState(role, { status: 'ready', progress: 100 })
      } else {
        setSlotState(role, {
          status: p > 50 ? 'processing' : 'uploading',
          progress: Math.round(p),
        })
      }
    }, 600)
  }

  function mockDrivePick(role: AssetSlot['role']) {
    const fakeName = 'GMT20260430_Webinar_Recording.mp4'
    setSlotState(role, { driveFileName: fakeName, sourceType: 'drive', status: 'pending' })
  }

  const allReady = zoom.status === 'ready' && stage.status === 'ready'

  if (!activeProject) {
    return (
      <div className="empty-state">
        <h3>No project selected</h3>
        <p>Go back to Projects and create or open a project first.</p>
        <button onClick={() => navigate('/projects')}>← Projects</button>
      </div>
    )
  }

  return (
    <>
      <div className="page-title">Import</div>
      <div className="page-subtitle">
        Import both source files. Each is ingested into Shotstack to get a canonical media URL.
      </div>

      <div className="mock-banner">
        ⚠ Phase 1 — ingest is simulated. Real Shotstack upload wires up in Phase 2.
      </div>

      {SLOTS.map(slot => {
        const state = getSlotState(slot.role)
        const hasSource = state.file !== null || state.driveFileName !== ''
        const sourceName = state.file?.name ?? state.driveFileName

        return (
          <div className="card" key={slot.role}>
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{slot.label}</div>
              <div className="spacer" />
              <span className={`pill ${state.status}`}>{state.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              {slot.description}
            </div>

            {state.status === 'ready' ? (
              <div style={{ color: 'var(--success)', fontSize: 13 }}>
                ✓ {sourceName} is ingested and ready.
              </div>
            ) : (
              <>
                <div className="row" style={{ marginBottom: 12 }}>
                  {slot.allowDrive && (
                    <button className="secondary" onClick={() => mockDrivePick(slot.role)}>
                      Pick from Google Drive
                    </button>
                  )}
                  <label style={{ display: 'inline-block', margin: 0 }}>
                    <button
                      className="secondary"
                      onClick={() => document.getElementById(`file-${slot.role}`)?.click()}
                      style={{ pointerEvents: 'none' }}
                    >
                      Choose Local File
                    </button>
                    <input
                      id={`file-${slot.role}`}
                      type="file"
                      accept="video/*"
                      style={{ display: 'none' }}
                      onChange={e => handleFileChange(slot.role, e)}
                    />
                  </label>
                </div>

                {hasSource && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                      Selected: <strong style={{ color: 'var(--text)' }}>{sourceName}</strong>
                    </div>
                    {state.status === 'pending' && (
                      <button onClick={() => simulateIngest(slot.role)}>
                        Start Ingest →
                      </button>
                    )}
                  </div>
                )}

                {(state.status === 'uploading' || state.status === 'processing') && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                      {state.status === 'uploading' ? 'Uploading to Shotstack…' : 'Processing source…'} {state.progress}%
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${state.progress}%` }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      <div className="row" style={{ marginTop: 8 }}>
        <div className="spacer" />
        <button disabled={!allReady} onClick={() => navigate('/sync')}>
          Both ingested — Continue to Sync →
        </button>
      </div>
    </>
  )
}
