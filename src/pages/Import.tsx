import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'
import {
  upsertAssetRow,
  runIngest,
  loadProjectAssets,
  validateFileSize,
  formatBytes,
  WARN_TOTAL_BYTES,
  type IngestPhase,
} from '@/lib/ingest'
import { getAccessToken, showDrivePicker, downloadDriveFile } from '@/lib/googleDrive'
import type { AssetRole } from '@/types'

// ─── Slot definitions ─────────────────────────────────────────────────────────

type SlotKey = 'zoom_master' | 'camera_a' | 'camera_b'

interface SlotDef {
  key: SlotKey
  role: AssetRole
  label: string
  description: string
  required: boolean
  allowDrive: boolean
}

const SLOT_DEFS: SlotDef[] = [
  {
    key: 'zoom_master',
    role: 'zoom_master',
    label: 'Zoom Recording',
    description: 'Master source for timing and audio. Import from Google Drive or local disk.',
    required: true,
    allowDrive: true,
  },
  {
    key: 'camera_a',
    role: 'camera_a',
    label: 'Camera Angle 1',
    description: 'Optional: stage-wide or any alternate angle. Local MP4 only.',
    required: false,
    allowDrive: false,
  },
  {
    key: 'camera_b',
    role: 'camera_b',
    label: 'Camera Angle 2',
    description: 'Optional: a second alternate angle. Local MP4 only.',
    required: false,
    allowDrive: false,
  },
]

// ─── Per-slot state ───────────────────────────────────────────────────────────

type SlotStatus =
  | 'idle'          // nothing selected
  | 'selected'      // file picked, not yet ingesting
  | 'downloading'   // downloading from Google Drive
  | 'uploading'     // PUT-ing to Shotstack
  | 'submitted'     // upload done, waiting for Shotstack
  | 'processing'    // Shotstack processing
  | 'ready'         // done ✓
  | 'error'

interface SlotState {
  assetId: string | null
  fileName: string
  fileSizeBytes: number
  mimeType: string
  status: SlotStatus
  uploadProgress: number   // 0–100
  downloadProgress: number // 0–100 (Drive download)
  error: string | null
  durationSeconds: number | null
}

const EMPTY_SLOT: SlotState = {
  assetId: null,
  fileName: '',
  fileSizeBytes: 0,
  mimeType: 'video/mp4',
  status: 'idle',
  uploadProgress: 0,
  downloadProgress: 0,
  error: null,
  durationSeconds: null,
}

type SlotsRecord = Record<SlotKey, SlotState>

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { activeProject } = useProject()
  const navigate = useNavigate()

  const [slots, setSlots] = useState<SlotsRecord>({
    zoom_master: { ...EMPTY_SLOT },
    camera_a:    { ...EMPTY_SLOT },
    camera_b:    { ...EMPTY_SLOT },
  })

  const [loadingExisting, setLoadingExisting] = useState(true)
  const [sizeWarning, setSizeWarning] = useState<string | null>(null)
  const [driveLoading, setDriveLoading] = useState(false)

  // File input refs — one per slot
  const fileRefs: Record<SlotKey, React.RefObject<HTMLInputElement>> = {
    zoom_master: useRef<HTMLInputElement>(null),
    camera_a:    useRef<HTMLInputElement>(null),
    camera_b:    useRef<HTMLInputElement>(null),
  }

  // ─── Load existing assets from DB ──────────────────────────────────────────

  useEffect(() => {
    if (!activeProject) { setLoadingExisting(false); return }

    loadProjectAssets(activeProject.id)
      .then(assets => {
        setSlots(prev => {
          const next = { ...prev }
          for (const asset of assets) {
            const key = asset.role as SlotKey
            if (!['zoom_master', 'camera_a', 'camera_b'].includes(key)) continue
            next[key] = {
              ...EMPTY_SLOT,
              assetId: asset.id,
              fileName: asset.original_name,
              fileSizeBytes: asset.size_bytes ?? 0,
              mimeType: asset.mime_type ?? 'video/mp4',
              status: (asset.ingest_status === 'ready'
                ? 'ready'
                : asset.ingest_status === 'error'
                ? 'error'
                : asset.ingest_status === 'processing' || asset.ingest_status === 'submitted'
                ? 'submitted'   // will need re-polling if user refreshes mid-ingest
                : 'idle') as SlotStatus,
              durationSeconds: asset.duration_seconds,
              error: null,
            }
          }
          return next
        })
      })
      .catch(err => console.error('Failed to load existing assets:', err))
      .finally(() => setLoadingExisting(false))
  }, [activeProject?.id])

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function patchSlot(key: SlotKey, patch: Partial<SlotState>) {
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function checkTotalSize(overrideSizes?: Partial<Record<SlotKey, number>>) {
    const sizes: Record<SlotKey, number> = {
      zoom_master: slots.zoom_master.fileSizeBytes,
      camera_a:    slots.camera_a.fileSizeBytes,
      camera_b:    slots.camera_b.fileSizeBytes,
      ...overrideSizes,
    }
    const total = Object.values(sizes).reduce((a, b) => a + b, 0)
    if (total > WARN_TOTAL_BYTES) {
      setSizeWarning(
        `Combined source size is ${formatBytes(total)}. Very large projects may take a long time to ingest and render.`
      )
    } else {
      setSizeWarning(null)
    }
  }

  // ─── Local file selection ───────────────────────────────────────────────────

  function handleFileInput(key: SlotKey, file: File) {
    const sizeError = validateFileSize(file.size)
    if (sizeError) {
      patchSlot(key, { status: 'error', error: sizeError })
      return
    }
    checkTotalSize({ [key]: file.size })
    patchSlot(key, {
      status: 'selected',
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || 'video/mp4',
      error: null,
      uploadProgress: 0,
      downloadProgress: 0,
    })
  }

  // ─── Google Drive pick + download + ingest ──────────────────────────────────

  async function handleDrivePick(key: SlotKey) {
    if (!activeProject) return
    setDriveLoading(true)
    patchSlot(key, { error: null })

    try {
      const token = await getAccessToken()
      const driveFile = await showDrivePicker(token)

      // Validate size before downloading
      const sizeError = validateFileSize(driveFile.sizeBytes)
      if (sizeError) {
        patchSlot(key, { status: 'error', error: sizeError })
        return
      }

      checkTotalSize({ [key]: driveFile.sizeBytes })

      patchSlot(key, {
        status: 'downloading',
        fileName: driveFile.name,
        fileSizeBytes: driveFile.sizeBytes,
        mimeType: driveFile.mimeType,
        error: null,
        downloadProgress: 0,
        uploadProgress: 0,
      })

      // Download from Drive
      const blob = await downloadDriveFile(
        driveFile.id,
        token,
        (loaded, total) => {
          patchSlot(key, { downloadProgress: Math.round((loaded / total) * 100) })
        }
      )

      // Create asset row in DB
      const assetId = await upsertAssetRow({
        projectId: activeProject.id,
        role: SLOT_DEFS.find(s => s.key === key)!.role,
        label: SLOT_DEFS.find(s => s.key === key)!.label,
        sourceProvider: 'google_drive',
        fileName: driveFile.name,
        mimeType: driveFile.mimeType,
        sizeBytes: driveFile.sizeBytes,
        driveFileId: driveFile.id,
      })

      patchSlot(key, { assetId })

      // Upload blob to Shotstack (same path as local)
      await runIngest(assetId, blob, driveFile.name, driveFile.mimeType, {
        onPhase: (phase: IngestPhase) => mapPhaseToPatch(key, phase),
        onUploadProgress: (pct: number) => patchSlot(key, { uploadProgress: pct }),
      })
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'cancelled') {
        patchSlot(key, { status: 'idle' })
      } else {
        patchSlot(key, { status: 'error', error: msg })
      }
    } finally {
      setDriveLoading(false)
    }
  }

  // ─── Local file ingest ──────────────────────────────────────────────────────

  async function handleStartIngest(key: SlotKey) {
    if (!activeProject) return
    const slotDef = SLOT_DEFS.find(s => s.key === key)!
    const currentSlot = slots[key]
    if (currentSlot.status !== 'selected') return

    // Read the file from the input ref
    const fileInput = fileRefs[key].current
    const file = fileInput?.files?.[0]
    if (!file) { patchSlot(key, { status: 'error', error: 'File no longer available — please re-select.' }); return }

    patchSlot(key, { error: null, uploadProgress: 0 })

    try {
      const assetId = await upsertAssetRow({
        projectId: activeProject.id,
        role: slotDef.role,
        label: slotDef.label,
        sourceProvider: 'local_upload',
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        sizeBytes: file.size,
      })

      patchSlot(key, { assetId })

      await runIngest(assetId, file, file.name, file.type || 'video/mp4', {
        onPhase: (phase: IngestPhase) => mapPhaseToPatch(key, phase),
        onUploadProgress: (pct: number) => patchSlot(key, { uploadProgress: pct }),
      })
    } catch (err) {
      patchSlot(key, { status: 'error', error: (err as Error).message })
    }
  }

  function mapPhaseToPatch(key: SlotKey, phase: IngestPhase) {
    const statusMap: Record<IngestPhase, SlotStatus> = {
      uploading:  'uploading',
      submitted:  'submitted',
      processing: 'processing',
      ready:      'ready',
      error:      'error',
    }
    patchSlot(key, { status: statusMap[phase] })
  }

  // ─── Continue button logic ──────────────────────────────────────────────────

  const zoomReady = slots.zoom_master.status === 'ready'
  const cameraABlocker = slots.camera_a.status !== 'idle' && slots.camera_a.status !== 'ready'
  const cameraBBlocker = slots.camera_b.status !== 'idle' && slots.camera_b.status !== 'ready'
  const canContinue = zoomReady && !cameraABlocker && !cameraBBlocker

  // ─── Guard ──────────────────────────────────────────────────────────────────

  if (!activeProject) {
    return (
      <div className="empty-state">
        <h3>No project selected</h3>
        <p>Go back to Projects and create or open a project first.</p>
        <button onClick={() => navigate('/projects')}>← Projects</button>
      </div>
    )
  }

  if (loadingExisting) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page-title">Import</div>
      <div className="page-subtitle">
        Import your Zoom recording (required) and up to two optional camera angles.
        Each source is uploaded to Shotstack to get a canonical media URL.
      </div>

      {sizeWarning && (
        <div className="mock-banner" style={{ marginBottom: 20 }}>⚠ {sizeWarning}</div>
      )}

      {SLOT_DEFS.map(slotDef => {
        const slot = slots[slotDef.key]
        return (
          <SlotCard
            key={slotDef.key}
            def={slotDef}
            slot={slot}
            fileRef={fileRefs[slotDef.key]}
            driveLoading={driveLoading}
            onFileInput={handleFileInput}
            onDrivePick={handleDrivePick}
            onStartIngest={handleStartIngest}
          />
        )
      })}

      <div className="row" style={{ marginTop: 8 }}>
        <div className="spacer" />
        {!zoomReady && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 12 }}>
            Zoom source must be ready to continue.
          </span>
        )}
        <button disabled={!canContinue} onClick={() => navigate('/sync')}>
          Continue to Sync →
        </button>
      </div>
    </>
  )
}

// ─── SlotCard sub-component ──────────────────────────────────────────────────

interface SlotCardProps {
  def: SlotDef
  slot: SlotState
  fileRef: React.RefObject<HTMLInputElement>
  driveLoading: boolean
  onFileInput: (key: SlotKey, file: File) => void
  onDrivePick: (key: SlotKey) => void
  onStartIngest: (key: SlotKey) => void
}

function SlotCard({ def, slot, fileRef, driveLoading, onFileInput, onDrivePick, onStartIngest }: SlotCardProps) {
  const { key, label, description, required, allowDrive } = def
  const { status, fileName, fileSizeBytes, uploadProgress, downloadProgress, error, durationSeconds } = slot

  const statusLabel: Record<SlotState['status'], string> = {
    idle:        required ? 'required' : 'optional',
    selected:    'ready to upload',
    downloading: 'downloading from Drive…',
    uploading:   'uploading…',
    submitted:   'waiting for Shotstack…',
    processing:  'Shotstack processing…',
    ready:       'ready',
    error:       'error',
  }

  const pillClass: Record<SlotState['status'], string> = {
    idle:        'pending',
    selected:    'pending',
    downloading: 'processing',
    uploading:   'processing',
    submitted:   'processing',
    processing:  'processing',
    ready:       'ready',
    error:       'error',
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {label}
          {!required && (
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>optional</span>
          )}
        </div>
        <div className="spacer" />
        <span className={`pill ${pillClass[status]}`}>{statusLabel[status]}</span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{description}</div>

      {/* ── Ready state ─────────────────────────────────────────────────── */}
      {status === 'ready' && (
        <div style={{ color: 'var(--success)', fontSize: 13 }}>
          ✓ <strong>{fileName}</strong>
          {fileSizeBytes > 0 && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>({formatBytes(fileSizeBytes)})</span>}
          {durationSeconds && (
            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
              · {Math.floor(durationSeconds / 60)}:{String(Math.round(durationSeconds % 60)).padStart(2, '0')}
            </span>
          )}
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {status === 'error' && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>
          ✗ {error}
        </div>
      )}

      {/* ── Idle / selected — pick controls ─────────────────────────────── */}
      {(status === 'idle' || status === 'selected' || status === 'error') && (
        <>
          <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            {allowDrive && (
              <button
                className="secondary"
                disabled={driveLoading}
                onClick={() => onDrivePick(key)}
              >
                {driveLoading ? 'Opening Drive…' : 'Pick from Google Drive'}
              </button>
            )}
            <button
              className="secondary"
              onClick={() => fileRef.current?.click()}
            >
              Choose Local File
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/mpeg,video/quicktime,video/x-msvideo,video/webm,.mp4,.mov,.avi,.wmv"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) onFileInput(key, f)
              }}
            />
          </div>

          {status === 'selected' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{fileName}</strong>
                {fileSizeBytes > 0 && <span style={{ marginLeft: 6 }}>({formatBytes(fileSizeBytes)})</span>}
              </div>
              <button onClick={() => onStartIngest(key)}>
                Start Ingest →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Download progress (Drive) ────────────────────────────────────── */}
      {status === 'downloading' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            Downloading <strong>{fileName}</strong> from Google Drive…
            {downloadProgress > 0 && ` ${downloadProgress}%`}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: downloadProgress > 0 ? `${downloadProgress}%` : '100%', opacity: downloadProgress > 0 ? 1 : 0.4 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Large files may take several minutes to download.
          </div>
        </div>
      )}

      {/* ── Upload progress ──────────────────────────────────────────────── */}
      {status === 'uploading' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            Uploading to Shotstack… {uploadProgress}%
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* ── Submitted / processing ───────────────────────────────────────── */}
      {(status === 'submitted' || status === 'processing') && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            {status === 'submitted'
              ? 'Upload complete — waiting for Shotstack to begin processing…'
              : 'Shotstack is processing the source (polling every 5 s)…'}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: status === 'processing' ? '70%' : '40%', opacity: 0.6 }} />
          </div>
        </div>
      )}
    </div>
  )
}
