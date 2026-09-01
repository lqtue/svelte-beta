-- Migration 063 — anonymous readers stop seeing draft maps
--
-- `maps_select_all` has been `using (true)` since migration 001 and was never
-- revisited. Migration 060 gated footprint_submissions, label_pins,
-- legend_submissions and metadata_submissions on `maps.status`, but left the
-- table those policies read from wide open. Measured against production before
-- this migration: the publishable key — which ships in every client bundle —
-- returned all 63 draft rows, the same count the service role sees.
--
-- The gate is authentication, not role. Open contribution (mig 038) means a
-- signed-in volunteer legitimately works on unpublished maps:
-- `fetchGeorefQueue` selects `.eq('status','draft')` for /contribute/georef,
-- and `fetchLabelMaps` feeds the digitalize and trace map pickers with rows
-- that are mostly drafts. Restricting to admin/mod would break all three.
-- There is no /signup, so an account is provisioned and revocable; anonymous
-- is the boundary that matters.
--
-- Insert/update/delete keep the policies migration 038 set. Only SELECT moves.

drop policy if exists "maps_select_all" on public.maps;

create policy "maps_select_published_or_authed"
  on public.maps for select
  using (
    status in ('public', 'featured')
    or auth.uid() is not null
  );
