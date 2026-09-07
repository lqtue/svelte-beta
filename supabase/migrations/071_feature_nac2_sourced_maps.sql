-- Migration 071 — feature the five sheets that carry NAC2 scholarship
--
-- The front page shows one featured sheet whole, with its `dc_description`
-- beside it. Every map featured until now had an empty description, so the page
-- fell back to a synthesised one-liner restating the title.
--
-- docs/journals/260907-nac2-holdings.md wrote a shortened Vietnamese caption
-- from Trung tâm Lưu trữ quốc gia II's "50 bản đồ tiêu biểu" exhibition into
-- `dc_description` on exactly five maps — dating arguments, decree numbers,
-- street-by-street identifications. Those are the five worth featuring: they
-- are the only sheets in the archive with anything to read.
--
-- No hosting work is enqueued by this. `enqueue_publish_jobs()` (mig 058) fires
-- on the status change, but all ten rows are already `source_type = 'r2'` with
-- `annotation_url` set, so both of its branches are guarded off.
--
-- Ids, not names: `maps.name` is edited (the 1882 topographic was renamed in
-- the same pass) and two rows share a year.

-- The NAC2-sourced sheets, oldest first.
update public.maps set status = 'featured'
 where id in (
   '603210b8-8b1f-4ed6-b421-d43b960c39db',  -- 1799 Plan de la ville de Saigon (Brun–Dayot)
   'f9b3c9b2-5a11-4e8a-8b11-c988b28ae6d3',  -- 1862 Coffyn, plan for a city of 500,000
   'e0aaf392-ea00-4838-b461-8e49d34dd939',  -- 1863 Plan du port de Saigon
   '3d065384-bb09-4b8c-b46b-bf006d0c3ba3',  -- 1882 Plan topographique du 20e Arrondissement
   '34d4edb2-f7df-4c47-a65a-f6b471400396'   -- 1959 Đô thành Sài Gòn
 );

-- The five they replace stay published, they are just no longer the front page.
update public.maps set status = 'public'
 where id in (
   '571b1f3d-62f2-4802-b3c2-b5727290bf55',  -- 1873 Hanoï, Pham-Dinh-Bach
   '0e02b9d9-9d40-4cca-8e41-8c8373d54d3b',  -- 1882 Plan Cadastral de la ville de Saigon
   '20ec4f9a-16bd-4895-a593-40c6ed9c9555',  -- 1898 Saigon Plan
   '5b07fabe-276e-4e1b-b031-5f414384b19b',  -- 1909 Province de Thua-thien
   '1bce28f0-aa82-48eb-8e33-8f0b07182c2f'   -- 1923 Saigon - Cholon
 );
