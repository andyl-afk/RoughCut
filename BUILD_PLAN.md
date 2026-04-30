# RoughCut — Build Plan

## Repo Audit

Fresh repository. No prior code existed. Everything scaffolded from scratch.

---

## Architecture

```
Browser (React SPA)
  └─ Supabase JS client
       ├─ Postgres (projects, assets, transcripts, highlights, renders)
       └─ Edge Functions (all secret-bearing API calls)
            ├─ Shotstack  (ingest + render)
            ├─ Deepgram   (transcription)
            └─ Anthropic  (highlight generation)
```

### Frontend
- Vite + React 18 + TypeScript
- React Router v6 (tab/step layout)
- Single-file components where feasible
- No UI framework — plain CSS for v1

### Backend
- Supabase only (no custom Node/Express server)
- Postgres for all state
- Supabase Edge Functions (Deno) for every call that needs a secret key

### External Services
| Service | Purpose |
|---------|---------|
| Google Picker API | Let user select Zoom file from Drive |
| Google Drive API | Download selected file to local buffer |
| Shotstack Ingest | Store both source videos, get canonical URLs |
| Shotstack Render | Build timeline JSON + render WIP MP4 |
| Deepgram | Transcribe Zoom source audio |
| Anthropic Claude | Suggest highlight candidates from transcript |

---

## Key Assumptions

1. Zoom recording is the master: its timeline and audio are canonical.
2. Stage camera is pre-compressed by user in HandBrake before import (no in-app compression).
3. Sync between sources is manual — user enters / nudges `sync_offset_ms`.
4. Single user, no auth required in v1 (can add Supabase Auth later).
5. Google Drive is used only for the Zoom file; stage camera is always local upload.
6. All secrets stay in Edge Functions — client never sees them.
7. Polling over webhooks for all async operations in v1.
8. Hard cuts only in v1 render output.

---

## Database Schema

Six tables: `projects`, `assets`, `transcripts`, `transcript_segments`,
`highlight_candidates`, `render_jobs`.

Migration file: `supabase/migrations/001_initial_schema.sql`

---

## Edge Functions

| Function | Trigger | Does |
|----------|---------|------|
| `create-shotstack-upload-url` | local file import | Creates a Shotstack signed upload URL |
| `create-shotstack-url-ingest` | Drive import | Submits a public URL to Shotstack ingest |
| `get-shotstack-source-status` | polling | Checks Shotstack source readiness |
| `start-transcription` | after Zoom ingested | Submits Zoom source to Deepgram |
| `get-transcription-status` | polling | Checks Deepgram job, stores segments |
| `generate-highlights` | after transcript ready | Calls Anthropic, stores candidates |
| `create-render` | after highlights approved | Builds timeline JSON + submits to Shotstack |
| `get-render-status` | polling | Checks render status + output URL |

---

## Phased Implementation Plan

### Phase 1 — Shell & Schema ✅ (this session)
- Vite + React + TypeScript app scaffold
- Supabase client wiring
- React Router with 6 tabs: Projects / Import / Sync / Transcript / Highlights / Render
- All screens as readable placeholders with mocked data
- SQL migration files (all 6 tables)
- Shared TypeScript types matching the schema
- All 8 Edge Function stubs (return 501 Not Implemented)
- `.env.example`
- `README.md`
- `BUILD_PLAN.md` (this file)

### Phase 2 — Project CRUD + Import
- Create / list / select projects (real Supabase calls)
- Google Picker integration (Drive selection)
- Local file upload path
- Shotstack signed upload URL flow (`create-shotstack-upload-url`)
- Drive download → Shotstack URL ingest flow (`create-shotstack-url-ingest`)
- Ingest status polling (`get-shotstack-source-status`)
- Asset table rows created and updated
- Import screen shows real progress

### Phase 3 — Sync UI
- Side-by-side video previews (HTML5 `<video>`)
- `sync_offset_ms` stored in project row
- Nudge controls (±frame, ±second, ±10s)
- Both players scrub in sync with offset applied

### Phase 4 — Transcription
- `start-transcription` Edge Function (Deepgram)
- `get-transcription-status` polling + segment storage
- Transcript screen renders real segments
- Speaker labels if available

### Phase 5 — Highlight Generation
- `generate-highlights` Edge Function (Anthropic Claude)
- Structured JSON prompt + response parsing
- Highlights screen: approve / reject / reorder / trim / angle selector

### Phase 6 — Render
- `create-render` Edge Function builds Shotstack timeline JSON
- Render submitted, job row created
- `get-render-status` polling
- Download WIP button when output URL available

### Phase 7 — Polish & Hardening
- Error states and retry UI
- Empty states
- Basic responsive layout
- Environment validation on startup
- Optional: Supabase Auth for single-user login

---

## What Is Done vs Not Done (after Phase 1)

| Area | Status |
|------|--------|
| App shell + routing | ✅ Done |
| SQL schema | ✅ Done |
| TypeScript types | ✅ Done |
| Supabase client | ✅ Done |
| Edge Function stubs | ✅ Done |
| `.env.example` | ✅ Done |
| README | ✅ Done |
| Project CRUD (real DB) | ⬜ Phase 2 |
| Google Picker | ⬜ Phase 2 |
| Local file upload | ⬜ Phase 2 |
| Shotstack ingest | ⬜ Phase 2 |
| Sync UI | ⬜ Phase 3 |
| Transcription | ⬜ Phase 4 |
| Highlight generation | ⬜ Phase 5 |
| Render + download | ⬜ Phase 6 |

---

## Future Considerations (not in v1)

- Iconik signed-URL ingest
- LucidLink / Iconik export
- HandBrakeCLI helper
- Music bed / title card / lower third templates
- EDL / FCPXML / Premiere XML export
- Auto-sync via waveform correlation
- Multi-user / team access
- Mux for streaming playback
- AssemblyAI as alternate transcription provider
