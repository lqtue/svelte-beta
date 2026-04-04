-- Separate categories column for trace/footprint classification (distinct from pin legend)
ALTER TABLE label_tasks ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '[]'::jsonb;
