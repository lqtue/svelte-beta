-- Migration 052 — drop the footprint map_id trigger left over from migration 021.
--
-- 021 added populate_footprint_map_id(): when a row arrived with no map_id it
-- looked one up from label_tasks via task_id. Migration 038 dropped both
-- footprint_submissions.task_id and the label_tasks table, but left the trigger
-- in place, so plpgsql resolves NEW.task_id at execution time and every insert
-- fails with `record "new" has no field "task_id"`.
--
-- The tracing UI has passed map_id explicitly since 038, so nothing needs the
-- backfill. Caught by tests/write.spec.ts against a database replayed from
-- these migrations.

drop trigger if exists trg_footprint_map_id on public.footprint_submissions;
drop function if exists public.populate_footprint_map_id();
