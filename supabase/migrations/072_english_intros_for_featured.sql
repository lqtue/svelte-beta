-- Migration 072 — a short English intro on every featured sheet
--
-- `app.html` mounts Google Translate with `pageLanguage: 'en'`, so the page
-- declares itself English and the widget's job is en → vi. A Vietnamese
-- `dc_description` therefore lands wrong both ways: an English reader sees raw
-- Vietnamese, and a Vietnamese reader gets Vietnamese run through an en → vi
-- translation. The display text has to be English for the widget to work.
--
-- The full NAC2 captions are not thrown away. Each moves to
-- `extra_metadata.nac2_caption_vi` verbatim — that is sourced scholarship, and
-- migration 071 is only three days old. `dc_description` becomes a two-to-four
-- sentence English précis of the same caption, keeping the names, dates and
-- decree numbers that make it worth citing, plus the credit.
--
-- See docs/journals/260907-nac2-holdings.md. That journal kept the captions in
-- Vietnamese deliberately; this reverses that for the display field only.

-- Keep the Vietnamese first, so a failure here cannot lose it.
update public.maps
   set extra_metadata = coalesce(extra_metadata, '{}'::jsonb)
                        || jsonb_build_object('nac2_caption_vi', dc_description)
 where id in (
   '603210b8-8b1f-4ed6-b421-d43b960c39db',
   'f9b3c9b2-5a11-4e8a-8b11-c988b28ae6d3',
   'e0aaf392-ea00-4838-b461-8e49d34dd939',
   '3d065384-bb09-4b8c-b46b-bf006d0c3ba3',
   '34d4edb2-f7df-4c47-a65a-f6b471400396'
 )
   and dc_description is not null;

-- 1799 Plan de la ville de Saigon (Brun–Dayot)
update public.maps set dc_description = $t$A reduction of the Grand Plan surveyed by royal order in 1795 by the engineer Brun, engraved by Jean-Marie Dayot and published in 1799. It shows the Gia Định citadel — Bát Quái, or Quy — raised to Vauban's pattern by Colonel Victor Olivier de Puymanel in 1790, with a key from A to V marking the king's and the queen's palaces, the granary, the shipyard, the barracks and the other works around it.

Note on the source: Trung tâm Lưu trữ quốc gia II publishes this same plate at nac2.gov.vn/csdl/bando/1.html captioned as a 1 March 1859 sketch by De Larclause. The cartouche on the sheet itself reads Brun and Dayot, 1799, and the impression carries a Bibliothèque nationale de France stamp.$t$
 where id = '603210b8-8b1f-4ed6-b421-d43b960c39db';

-- 1862 Coffyn
update public.maps set dc_description = $t$Saigon's earliest plan, drawn in 1862 by Lieutenant-Colonel Coffyn of the engineers for a city of 500,000 to 600,000 people, joining Bến Nghé in the east to Saigon — today's Chợ Lớn — in the west. It sets an administrative quarter around the Gia Định citadel, holding the governor's residence, the barracks, the military hospital and the shipyard, against a commercial quarter over the rest. Its main proposals were a defensive canal to the west, begun in November 1862 and 6 km long, later the Vành Đai; a central lake 426 m across that was never dug; the half-moon Primauguet square on the river, now Công trường Mê Linh; and keeping the Kinh Lớn and eight old roads intact. Every colonial plan for Saigon and Chợ Lớn that followed starts here.

Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/5.html. The original is held at the Archives nationales d'outre-mer (ANOM).$t$
 where id = 'f9b3c9b2-5a11-4e8a-8b11-c988b28ae6d3';

-- 1863 Plan du port de Saigon
update public.maps set dc_description = $t$Surveyed in 1863 by the naval engineers F. Vidalin (1831–1887) and G. Héraud (1839–1914) on Rear-Admiral de La Grandière's orders, and published by the Dépôt des cartes et plans in 1866. It gives channel soundings for the port reach of the Saigon river and part of the Bến Nghé creek, with the tide notes for 1863, and marks the commercial port, the naval yard with its arsenal and floating dock, and the Observatoire mast raised by Rear-Admiral Bonard — the ancestor of today's Thủ Ngữ flagpole. The seat of government sits inside four streets now called Hai Bà Trưng, Nguyễn Du, Pasteur and Lý Tự Trọng. The Phụng citadel still stands, abandoned since 1859, and the streets are still numbered: they were not named until the decree of 1 February 1865.

Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/6.html$t$
 where id = 'e0aaf392-ea00-4838-b461-8e49d34dd939';

-- 1882 Plan topographique du 20e Arrondissement
update public.maps set dc_description = $t$A 1:20,000 topographic survey of the 20th arrondissement and its surroundings — an administrative unit that lasted under eight years, created by a decree of the Governor of Cochinchina on 13 December 1880 and dissolved on 12 January 1888. It was split into the canton of Bình Chánh Thượng to the north, ten villages, and Dương Minh to the south, thirteen. Those boundaries are what every later change to the limits of Saigon and Chợ Lớn was drawn against. The sheet records each village boundary as it stood in 1882 in fine detail, with roads, waterways, communal houses, pagodas, ferry landings and forts, running from Saigon, Chợ Lớn and Bình Hòa out to Gò Vấp, and from Chợ Lớn through Thị Nghè to Thủ Đức.

Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/15.html$t$
 where id = '3d065384-bb09-4b8c-b46b-bf006d0c3ba3';

-- 1959 Đô thành Sài Gòn
update public.maps set dc_description = $t$A 1:10,000 plan naming 384 boulevards, streets, quays, lanes and squares with 156 keyed locations — the most detailed map of urban Saigon and Chợ Lớn of its period. It shows the eight districts created by decree 110-NV of 27 March 1959, a division far closer to today's than the one of 1952 and the basis for the districts that followed; the eight were subdivided into 41 wards soon after. The satellite quarters of Phú Nhuận, Bình Hòa, Thị Nghè and Thủ Thiêm are visibly taking shape, while District 4 is still largely fields and canals.

Published by Nha Địa-Dư Quốc-Gia as the second edition: revised in 1956 from French Geographic Institute aerial photography flown in 1953 at 1:15,000, with survey additions inside the city in 1957, and reissued in 1959. Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/38.html, and from the Virtual Saigon record (ID 855, IAO Map Collection).$t$
 where id = '34d4edb2-f7df-4c47-a65a-f6b471400396';
