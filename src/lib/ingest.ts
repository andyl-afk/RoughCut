// Ingest pipeline: upload a file to Shotstack and poll until ready.
// Used by the Import page for both local files and Drive-downloaded files.

import { supabase, callEdgeFunction } from './supabase'
import type { AssetRole, IngestStatus, UploadUrlResponse, SourceStatusResponse } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024       // 5 GB hard limit per file
export const WARN_TOTAL_BYTES = 10 * 1024 * 1024 * 1024    // 10 GB combined soft warning
const POLL_INTERVAL_MS = 5_000
const MAX_POLL_ATTEMPTS = 144  // 12 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function validateFileSize(bytes: number): string | null {
  if (bytes > MAX_FILE_BYTES) {
    return `File is ${formatBytes(bytes)} — exceeds the 5 GB limit per source.`
  }
  return null
}

// ─── XHR upload with progress ─────────────────────────────────────────────────

export function uploadWithProgress(
  url: string,
  data: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed: HTTP ${xhr.status} ${xhr.statusText}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Upload failed: network error')))
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.send(data)
  })
}

// ─── Asset DB row ─────────────────────────────────────────────────────────────

export async function upsertAssetRow(params: {
  projectId: string
  role: AssetRole
  label: string
  sourceProvider: 'local_upload' | 'google_drive'
  fileName: string
  mimeType: string
  sizeBytes: number
  driveFileId?: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('assets')
    .upsert(
      {
        project_id: params.projectId,
        role: params.role,
        label: params.label,
        source_provider: params.sourceProvider,
        original_name: params.fileName,
        mime_type: params.mimeType,
        size_bytes: params.sizeBytes,
        provider_file_id: params.driveFileId ?? null,
        ingest_status: 'uploading' as IngestStatus,
        // clear any stale Shotstack data from a previous attempt
        shotstack_source_id: null,
        shotstack_source_url: null,
        duration_seconds: null,
        width: null,
        height: null,
        fps: null,
      },
      { onConflict: 'project_id,role', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (error) throw new Error(`Failed to save asset: ${error.message}`)
  return data.id
}

// ─── Full ingest pipeline ─────────────────────────────────────────────────────

export type IngestPhase =
  | 'uploading'   // PUT-ing to Shotstack
  | 'submitted'   // PUT done, waiting for Shotstack to process
  | 'processing'  // Shotstack is processing
  | 'ready'       // done
  | 'error'       // something went wrong

export interface IngestCallbacks {
  onPhase: (phase: IngestPhase) => void
  onUploadProgress: (pct: number) => void
}

export async function runIngest(
  assetId: string,
  file: Blob,
  fileName: string,
  mimeType: string,
  callbacks: IngestCallbacks
): Promise<string> {
  // 1. Ask Shotstack for a signed upload URL
  const { upload_url, shotstack_source_id } = await callEdgeFunction<UploadUrlResponse>(
    'create-shotstack-upload-url',
    { file_name: fileName, mime_type: mimeType, size_bytes: file.size }
  )

  // 2. Save the Shotstack source ID immediately so we can recover on reload
  await supabase
    .from('assets')
    .update({ shotstack_source_id, ingest_status: 'uploading' })
    .eq('id', assetId)

  // 3. Upload the file
  callbacks.onPhase('uploading')
  await uploadWithProgress(upload_url, file, mimeType, callbacks.onUploadProgress)

  // 4. Mark submitted
  callbacks.onPhase('submitted')
  await supabase
    .from('assets')
    .update({ ingest_status: 'submitted' })
    .eq('id', assetId)

  // 5. Poll until ready
  return new Promise<string>((resolve, reject) => {
    let attempts = 0

    const tick = async () => {
      attempts++
      if (attempts > MAX_POLL_ATTEMPTS) {
        callbacks.onPhase('error')
        await supabase.from('assets').update({ ingest_status: 'error' }).eq('id', assetId)
        reject(new Error('Ingest timed out — Shotstack did not complete within 12 minutes.'))
        return
      }

      try {
        const result = await callEdgeFunction<SourceStatusResponse>(
          'get-shotstack-source-status',
          { shotstack_source_id }
        )

        if (result.status === 'processing') callbacks.onPhase('processing')

        if (result.status === 'ready') {
          callbacks.onPhase('ready')
          await supabase.from('assets').update({
            ingest_status: 'ready',
            shotstack_source_url: result.url,
            duration_seconds: result.duration_seconds,
            width: result.width,
            height: result.height,
            fps: result.fps,
          }).eq('id', assetId)
          resolve(result.url ?? '')
          return
        }

        if (result.status === 'error') {
          callbacks.onPhase('error')
          await supabase.from('assets').update({ ingest_status: 'error' }).eq('id', assetId)
          reject(new Error('Shotstack reported an ingest error.'))
          return
        }
      } catch {
        // transient network error — keep polling
      }

      setTimeout(tick, POLL_INTERVAL_MS)
    }

    setTimeout(tick, POLL_INTERVAL_MS)
  })
}

// ─── Load existing assets for a project ──────────────────────────────────────

export async function loadProjectAssets(projectId: string) {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('project_id', projectId)
    .in('role', ['zoom_master', 'camera_a', 'camera_b'])

  if (error) throw new Error(`Failed to load assets: ${error.message}`)
  return data ?? []
}
