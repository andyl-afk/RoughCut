-- RoughCut — initial schema
-- Run this in the Supabase SQL editor (or via supabase db push).

-- ─── Enums ────────────────────────────────────────────────────────────────────

create type project_status as enum (
  'draft', 'importing', 'ingesting', 'transcribing',
  'highlighting', 'editing', 'rendering', 'done'
);

create type asset_role as enum ('zoom_master', 'stage_wide_mezzanine');

create type asset_source_provider as enum (
  'google_drive', 'local_upload', 'external_url', 'shotstack_ingest'
);

create type ingest_status as enum (
  'pending', 'uploading', 'submitted', 'processing', 'ready', 'error'
);

create type transcript_status as enum ('pending', 'processing', 'ready', 'error');

create type highlight_source as enum ('claude');

create type highlight_status as enum ('pending', 'approved', 'rejected');

create type angle_preference as enum ('zoom', 'stage');

create type render_provider as enum ('shotstack');

create type render_status as enum (
  'pending', 'queued', 'fetching', 'rendering', 'saving', 'done', 'failed'
);

-- ─── projects ─────────────────────────────────────────────────────────────────

create table projects (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  status                 project_status not null default 'draft',
  recap_brief            jsonb,           -- { desired_outcome, topics_to_emphasize[], topics_to_avoid[], cta_outro_text }
  target_runtime_seconds integer,
  sync_offset_ms         integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ─── assets ───────────────────────────────────────────────────────────────────

create table assets (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  role                  asset_role not null,
  source_provider       asset_source_provider not null,
  original_name         text not null,
  mime_type             text,
  size_bytes            bigint,
  provider_file_id      text,            -- e.g. Google Drive file ID
  provider_url          text,            -- original source URL (Drive direct-download etc)
  shotstack_source_id   text,            -- Shotstack ingest source ID
  shotstack_source_url  text,            -- canonical Shotstack-hosted URL (ready state)
  ingest_status         ingest_status not null default 'pending',
  duration_seconds      numeric,
  width                 integer,
  height                integer,
  fps                   numeric,
  raw_metadata          jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (project_id, role)              -- one zoom + one stage per project
);

-- ─── transcripts ──────────────────────────────────────────────────────────────

create table transcripts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  asset_id        uuid not null references assets(id) on delete cascade,
  provider        text not null default 'deepgram',
  provider_job_id text,
  status          transcript_status not null default 'pending',
  language        text,
  full_text       text,
  raw_response    jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── transcript_segments ──────────────────────────────────────────────────────

create table transcript_segments (
  id            uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references transcripts(id) on delete cascade,
  start_ms      integer not null,
  end_ms        integer not null,
  speaker       text,
  text          text not null,
  confidence    numeric,
  sort_order    integer not null,
  constraint chk_start_before_end check (start_ms < end_ms)
);

create index idx_segments_transcript on transcript_segments(transcript_id, sort_order);

-- ─── highlight_candidates ─────────────────────────────────────────────────────

create table highlight_candidates (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  source           highlight_source not null default 'claude',
  title            text not null,
  reason           text not null,
  start_ms         integer not null,
  end_ms           integer not null,
  score            numeric,
  excerpt          text not null,
  status           highlight_status not null default 'pending',
  angle_preference angle_preference not null default 'zoom',
  sort_order       integer not null default 0,
  raw_response     jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_highlight_start_before_end check (start_ms < end_ms)
);

create index idx_highlights_project on highlight_candidates(project_id, sort_order);

-- ─── render_jobs ──────────────────────────────────────────────────────────────

create table render_jobs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  provider        render_provider not null default 'shotstack',
  provider_job_id text,
  status          render_status not null default 'pending',
  timeline_json   jsonb,
  output_url      text,
  serve_status    text,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

create trigger trg_assets_updated_at
  before update on assets
  for each row execute function set_updated_at();

create trigger trg_transcripts_updated_at
  before update on transcripts
  for each row execute function set_updated_at();

create trigger trg_highlights_updated_at
  before update on highlight_candidates
  for each row execute function set_updated_at();

create trigger trg_render_jobs_updated_at
  before update on render_jobs
  for each row execute function set_updated_at();

-- ─── Row Level Security (single-user — disable RLS for now) ───────────────────
-- In v1 there is no auth. Enable RLS + policies in Phase 7 when auth is added.
alter table projects             disable row level security;
alter table assets               disable row level security;
alter table transcripts          disable row level security;
alter table transcript_segments  disable row level security;
alter table highlight_candidates disable row level security;
alter table render_jobs          disable row level security;
