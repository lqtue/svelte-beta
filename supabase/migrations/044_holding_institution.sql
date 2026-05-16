-- Add holding_institution to maps, separating "who holds the physical/digital original"
-- from source_type (which describes where WE serve the image from).
--
-- Before: collection conflated archival sub-collection AND host institution
--   e.g. SGI map on BnF had collection='BnF Gallica'; same map self-hosted had
--   collection='Service Géographique de l'Indochine' (the creator, not the holder)
--
-- After:
--   creator             = who made the map (e.g. SGI, US Army Map Service)
--   dc_publisher        = who published/issued it
--   holding_institution = who holds the original copy now
--                         (Bibliothèque nationale de France, Cartomundi,
--                          Humazur, UT Austin PCL, etc.)
--   collection          = archival sub-collection at the holder
--                         (e.g. "Département Cartes et plans", "AMS Series L7014")
--   shelfmark           = catalog ID at the holder
--   source_url          = URL of the item page at the holder
--   source_type         = how WE serve it (bnf | ia | gallica | rumsey | humazur |
--                         efeo | self | r2 | other) — unchanged

alter table maps add column if not exists holding_institution text;

comment on column maps.holding_institution is
  'The institution that holds the original (physical or authoritative digital) copy of this map. Distinct from source_type, which describes where VMA serves the image from.';

create index if not exists idx_maps_holding_institution on maps (holding_institution);
