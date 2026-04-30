# RoughCut

A single-user, transcript-driven webinar recap editor. Import two source videos (Zoom recording + stage camera mezzanine), transcribe the Zoom source, let Claude suggest highlights, approve/trim/reorder them, and render a WIP MP4.

---

## Quick-start

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and the two Google values

# 3. Run the app
npm run dev
# Opens at http://localhost:5173
```

---

## Before you begin — manual preprocessing

The broadcast camera file from your recording setup is likely very large (100–200 GB).
Before importing it into RoughCut, compress it in HandBrake:

- **Preset:** H.264 1080p (or your preferred mezzanine codec)
- **Target bitrate:** 8–20 Mbps depending on content
- **Audio:** AAC stereo, 192 kbps

The resulting mezzanine MP4 is what you upload as the Stage Camera source.
RoughCut v1 does not do this compression step for you.

---

## Supabase setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New project.

### 2. Run the database migration

In the Supabase Dashboard → SQL Editor, paste and run:

```
supabase/migrations/001_initial_schema.sql
```

Or if you have the Supabase CLI installed:

```bash
supabase db push
```

### 3. Set Edge Function secrets

In the Supabase Dashboard → Edge Functions → Manage secrets, add:

| Key | Value |
|-----|-------|
| `SHOTSTACK_API_KEY` | Your Shotstack API key |
| `DEEPGRAM_API_KEY` | Your Deepgram API key |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

Or via CLI:

```bash
supabase secrets set SHOTSTACK_API_KEY=xxx
supabase secrets set DEEPGRAM_API_KEY=xxx
supabase secrets set ANTHROPIC_API_KEY=xxx
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy create-shotstack-upload-url
supabase functions deploy create-shotstack-url-ingest
supabase functions deploy get-shotstack-source-status
supabase functions deploy start-transcription
supabase functions deploy get-transcription-status
supabase functions deploy generate-highlights
supabase functions deploy create-render
supabase functions deploy get-render-status
```

---

## Google OAuth / Picker setup

You need two Google credentials:

### OAuth 2.0 Client ID (for Drive access)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create credential → OAuth 2.0 Client ID → Web Application
3. Add `http://localhost:5173` to Authorised JavaScript origins
4. Add your production domain too when you deploy
5. Copy the Client ID → `VITE_GOOGLE_CLIENT_ID` in your `.env`

### API Key (for Google Picker)

1. In the same Credentials page → Create credential → API key
2. Restrict it to: **Google Picker API** only, and your domain
3. Copy it → `VITE_GOOGLE_PICKER_API_KEY` in your `.env`

### Enable the APIs

In Google Cloud Console → APIs & Services → Library, enable:
- **Google Drive API**
- **Google Picker API**

---

## Provider accounts

| Service | What you need | Free tier |
|---------|--------------|-----------|
| [Shotstack](https://shotstack.io) | API key | Yes (watermarked renders) |
| [Deepgram](https://deepgram.com) | API key | $200 free credit |
| [Anthropic](https://console.anthropic.com) | API key | Pay-as-you-go |

---

## How each phase works

### Phase 1 (current) — Shell
The app is fully navigable with mocked data. No real API calls are made. All six steps are visible and interactive with simulated delays.

### Phase 2 — Import
- Create projects in Supabase
- Pick Zoom file from Google Drive or local disk
- Pick Stage Camera mezzanine from local disk
- Both files ingested into Shotstack (signed upload URL or URL ingest)
- Polling loop waits for Shotstack to mark sources as `ready`

### Phase 3 — Sync
- Side-by-side HTML5 video players (Shotstack-hosted URLs)
- Nudge `sync_offset_ms` with frame/second/10-second buttons
- Value saved to the `projects` table

### Phase 4 — Transcription
- Zoom source URL submitted to Deepgram
- Speaker-labelled segments stored in `transcript_segments`
- Searchable transcript view

### Phase 5 — Highlights
- Transcript + recap brief sent to Anthropic Claude
- 8–15 structured highlight candidates returned
- Approve / reject / reorder / trim each clip
- Choose camera angle (Zoom or Stage Wide) per clip

### Phase 6 — Render
- Shotstack timeline JSON built from approved highlights
- Submitted to Shotstack render API
- Polling loop waits for `done` status
- Download WIP MP4 button appears

---

## Project structure

```
src/
  types/        Shared TypeScript types (mirrors DB schema)
  lib/          Supabase client + edge function helper
  context/      React context (active project)
  components/   Layout, shared UI
  pages/        One file per step (Projects, Import, Sync, Transcript, Highlights, Render)

supabase/
  migrations/   SQL schema
  functions/    Edge Functions (one folder per function)
```

---

## Environment variables reference

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | `.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` | Supabase anon (public) key |
| `VITE_GOOGLE_CLIENT_ID` | `.env` | Google OAuth client ID |
| `VITE_GOOGLE_PICKER_API_KEY` | `.env` | Google Picker API key |
| `SHOTSTACK_API_KEY` | Supabase secrets | Shotstack ingest + render |
| `DEEPGRAM_API_KEY` | Supabase secrets | Audio transcription |
| `ANTHROPIC_API_KEY` | Supabase secrets | Highlight generation |
