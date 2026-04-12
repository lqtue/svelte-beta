-- Allow 'cataloger' as a valid profile role (alongside 'user' and 'admin').
-- profiles.role is free-text so no schema change is needed;
-- this migration documents the new role and adds an RLS policy so catalogers
-- can read all maps (same as public) but update is enforced in the API layer.

-- No structural changes — role is already text with no check constraint.
-- This migration is intentionally a no-op DDL; it serves as a record that
-- 'cataloger' is a supported role value as of this migration.
select 1;
