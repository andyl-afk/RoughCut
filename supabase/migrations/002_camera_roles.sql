-- Phase 2: support multiple camera angles + human-readable labels on assets
-- Run in Supabase SQL Editor after 001_initial_schema.sql

-- Add two optional camera angle roles
-- (ALTER TYPE ADD VALUE cannot run inside a transaction — run these separately if needed)
ALTER TYPE asset_role ADD VALUE IF NOT EXISTS 'camera_a';
ALTER TYPE asset_role ADD VALUE IF NOT EXISTS 'camera_b';

-- Human-readable label for each asset slot (e.g. "Wide shot", "Camera 2")
ALTER TABLE assets ADD COLUMN IF NOT EXISTS label text;

-- Drop the old unique constraint so we can safely re-insert on conflict
-- The new upsert path uses (project_id, role) as the conflict target
-- The constraint still exists from migration 001, so we need to keep it.
-- If it was named differently on your instance, adjust accordingly:
-- ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_project_id_role_key;
-- ALTER TABLE assets ADD CONSTRAINT assets_project_id_role_key UNIQUE (project_id, role);
