-- Migration 007: Annotation sets table
-- Stores saved annotation collections that users can share

CREATE TABLE IF NOT EXISTS public.annotation_sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL DEFAULT 'Untitled',
  map_id        text NOT NULL,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  features      jsonb NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}',
  is_public     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annotation_sets_map_id ON public.annotation_sets(map_id);
CREATE INDEX IF NOT EXISTS idx_annotation_sets_user_id ON public.annotation_sets(user_id);

ALTER TABLE public.annotation_sets ENABLE ROW LEVEL SECURITY;

-- Users can read their own annotation sets
CREATE POLICY "Users can read own annotation sets"
  ON public.annotation_sets FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read public annotation sets
CREATE POLICY "Anyone can read public annotation sets"
  ON public.annotation_sets FOR SELECT
  USING (is_public = true);

-- Users can insert their own
CREATE POLICY "Users can create annotation sets"
  ON public.annotation_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own
CREATE POLICY "Users can update own annotation sets"
  ON public.annotation_sets FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own
CREATE POLICY "Users can delete own annotation sets"
  ON public.annotation_sets FOR DELETE
  USING (auth.uid() = user_id);
