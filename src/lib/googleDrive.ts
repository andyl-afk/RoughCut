// Google Drive Picker + file download utilities
// Requires VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_PICKER_API_KEY in .env

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi: any
    google: any
  }
}

// ─── Script loaders (idempotent) ─────────────────────────────────────────────

let gapiPickerPromise: Promise<void> | null = null

function loadGapiPicker(): Promise<void> {
  if (gapiPickerPromise) return gapiPickerPromise
  gapiPickerPromise = new Promise((resolve, reject) => {
    if (window.gapi?.picker) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => window.gapi.load('picker', { callback: resolve, onerror: reject })
    script.onerror = reject
    document.body.appendChild(script)
  })
  return gapiPickerPromise
}

let gisPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    script.onerror = reject
    document.body.appendChild(script)
  })
  return gisPromise
}

// ─── OAuth token ──────────────────────────────────────────────────────────────

let cachedToken: string | null = null
let tokenExpiry = 0

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  await loadGis()

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set in .env')

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (resp: any) => {
        if (resp.error) { reject(new Error(resp.error)); return }
        cachedToken = resp.access_token
        tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

// ─── Picker ───────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
}

export async function showDrivePicker(accessToken: string): Promise<DriveFile> {
  await loadGapiPicker()

  const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY
  if (!apiKey) throw new Error('VITE_GOOGLE_PICKER_API_KEY is not set in .env')

  return new Promise((resolve, reject) => {
    const view = new window.google.picker.DocsView()
    view.setMimeTypes('video/mp4,video/mpeg,video/quicktime,video/x-msvideo,video/x-ms-wmv,video/webm')
    view.setSelectFolderEnabled(false)

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setTitle('Select your Zoom recording')
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0]
          resolve({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType ?? 'video/mp4',
            sizeBytes: doc.sizeBytes ?? 0,
          })
        } else if (data.action === window.google.picker.Action.CANCEL) {
          reject(new Error('cancelled'))
        }
      })
      .build()

    picker.setVisible(true)
  })
}

// ─── File download from Drive ─────────────────────────────────────────────────

export async function downloadDriveFile(
  fileId: string,
  accessToken: string,
  onProgress: (loaded: number, total: number) => void
): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    throw new Error(`Google Drive download failed (HTTP ${res.status}). Make sure the file is accessible.`)
  }

  const contentLength = res.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength) : 0

  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total > 0) onProgress(loaded, total)
  }

  // Combine chunks into a single Blob
  const blob = new Blob(chunks, { type: 'video/mp4' })
  return blob
}
