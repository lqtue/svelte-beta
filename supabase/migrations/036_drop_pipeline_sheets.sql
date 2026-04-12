-- Drop pipeline_sheets table (L7014 automation pipeline removed).
-- All pipeline code was already deleted from src/. This removes the DB side.
drop table if exists public.pipeline_sheets;
