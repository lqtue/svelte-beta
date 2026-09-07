-- Migration 073 — the 1959 Đô-thành Sài Gòn record, from its Virtual Saigon entry
--
-- Fields transcribed from https://virtual-saigon.net/maps/collection?ID=855
-- (IAO Map Collection). Four corrections and additions:
--
-- 1. `creator` held 'Nha Dư địa Quốc gia'. The agency is **Nha Địa-Dư Quốc-Gia**
--    — 'địa dư' (geography) had been transposed to 'dư địa'. Virtual Saigon
--    lists it as the publisher, not the creator, which is right for a national
--    mapping agency issuing its own sheet, so it moves to `dc_publisher` and
--    `creator` is cleared rather than carrying the same name twice.
-- 2. `original_title` held 'Đô thành Sài Gòn (1959)' — a cataloguer's title with
--    the year appended. The sheet is printed 'Đô-thành Sài Gòn', hyphenated in
--    the orthography of its day.
-- 3. `physical_description` and `dc_subject` were empty.
-- 4. Edition, the Virtual Saigon document id and the Vietnamese revision note go
--    to `extra_metadata`: there is no column for any of them, and inventing
--    three would be three columns used by one row.

update public.maps
   set dc_publisher = 'Nha Địa-Dư Quốc-Gia',
       creator = null,
       original_title = 'Đô-thành Sài Gòn',
       physical_description = '105 × 73 cm, paper original; scanned as TIFF at 600 dpi.',
       dc_subject = 'Saigon; Sài Gòn',
       extra_metadata = coalesce(extra_metadata, '{}'::jsonb) || jsonb_build_object(
         'edition', '2ème édition',
         'source_collection', 'IAO Map Collection, Virtual Saigon',
         'virtual_saigon_id', '855',
         'revision_note_vi', 'Điều-chỉnh năm 1956 bằng phi-ảnh tỷ-lệ-xích 1:15 000 của Viện Địa-Dư Pháp chụp năm 1953. Bổ-túc trắc-họa trong Đô-Thành năm 1957; 11-59; Tái xuất bản năm 1959.'
       )
 where id = '34d4edb2-f7df-4c47-a65a-f6b471400396';
