// ─── Core domain types — mirror the Postgres schema ────────────────────────

export type ProjectStatus =
  | 'draft'
  | 'importing'
  | 'ingesting'
  | 'transcribing'
  | 'highlighting'
  | 'editing'
  | 'rendering'
  | 'done'

export interface RecapBrief {
  desired_outcome: string
  topics_to_emphasize: string[]
  topics_to_avoid: string[]
  cta_outro_text?: string
}

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  recap_brief: RecapBrief | null
  target_runtime_seconds: number | null
  sync_offset_ms: number
  created_at: string
  updated_at: string
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export type AssetRole = 'zoom_master' | 'camera_a' | 'camera_b'

export type AssetSourceProvider =
  | 'google_drive'
  | 'local_upload'
  | 'external_url'
  | 'shotstack_ingest'

export type IngestStatus =
  | 'pending'
  | 'uploading'
  | 'submitted'
  | 'processing'
  | 'ready'
  | 'error'

export interface Asset {
  id: string
  project_id: string
  role: AssetRole
  label: string | null
  source_provider: AssetSourceProvider
  original_name: string
  mime_type: string | null
  size_bytes: number | null
  provider_file_id: string | null
  provider_url: string | null
  shotstack_source_id: string | null
  shotstack_source_url: string | null
  ingest_status: IngestStatus
  duration_seconds: number | null
  width: number | null
  height: number | null
  fps: number | null
  raw_metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ─── Transcripts ─────────────────────────────────────────────────────────────

export type TranscriptStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'error'

export interface Transcript {
  id: string
  project_id: string
  asset_id: string
  provider: string
  provider_job_id: string | null
  status: TranscriptStatus
  language: string | null
  full_text: string | null
  raw_response: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface TranscriptSegment {
  id: string
  transcript_id: string
  start_ms: number
  end_ms: number
  speaker: string | null
  text: string
  confidence: number | null
  sort_order: number
}

// ─── Highlight Candidates ────────────────────────────────────────────────────

export type HighlightSource = 'claude'

export type HighlightStatus = 'pending' | 'approved' | 'rejected'

export type AnglePreference = 'zoom' | 'stage'

export interface HighlightCandidate {
  id: string
  project_id: string
  source: HighlightSource
  title: string
  reason: string
  start_ms: number
  end_ms: number
  score: number | null
  excerpt: string
  status: HighlightStatus
  angle_preference: AnglePreference
  sort_order: number
  raw_response: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ─── Render Jobs ─────────────────────────────────────────────────────────────

export type RenderProvider = 'shotstack'

export type RenderStatus =
  | 'pending'
  | 'queued'
  | 'fetching'
  | 'rendering'
  | 'saving'
  | 'done'
  | 'failed'

export interface RenderJob {
  id: string
  project_id: string
  provider: RenderProvider
  provider_job_id: string | null
  status: RenderStatus
  timeline_json: Record<string, unknown> | null
  output_url: string | null
  serve_status: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ─── Edge Function response shapes ───────────────────────────────────────────

export interface UploadUrlResponse {
  upload_url: string
  shotstack_source_id: string
}

export interface IngestUrlResponse {
  shotstack_source_id: string
}

export interface SourceStatusResponse {
  shotstack_source_id: string
  status: IngestStatus
  url: string | null
  duration_seconds: number | null
  width: number | null
  height: number | null
  fps: number | null
}

export interface TranscriptionStartResponse {
  transcript_id: string
  provider_job_id: string
}

export interface TranscriptionStatusResponse {
  transcript_id: string
  status: TranscriptStatus
  segments_count: number
}

export interface GenerateHighlightsResponse {
  candidates_created: number
}

export interface CreateRenderResponse {
  render_job_id: string
  provider_job_id: string
}

export interface RenderStatusResponse {
  render_job_id: string
  status: RenderStatus
  output_url: string | null
  error_message: string | null
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

export type AppStep =
  | 'projects'
  | 'import'
  | 'sync'
  | 'transcript'
  | 'highlights'
  | 'render'
