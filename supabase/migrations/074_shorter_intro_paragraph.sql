-- Migration 074 — a one-sentence lede on every featured sheet
--
-- The front page shows a description's first paragraph and /catalog/[id] shows
-- all of it, so where the first break falls decides what a reader meets on the
-- card. After 072 that paragraph was three or four sentences — the length of an
-- abstract, not of a caption under a picture.
--
-- Every description now opens with a lede: one or two sentences, under 200
-- characters, saying what the sheet is and why it matters. Nothing is cut. What
-- was the opening paragraph becomes the body, the enumerations follow it, and
-- the source credit stays last. The record page prints all three.

-- 1799 Plan de la ville de Saigon (Brun–Dayot)
update public.maps set dc_description = $t$A reduction of the Grand Plan surveyed by royal order in 1795, engraved by Jean-Marie Dayot and published in 1799 — the earliest sheet in the archive to show the Gia Định citadel standing.

The survey was made by the engineer Brun. The citadel — Bát Quái, or Quy — was raised to Vauban's pattern by Colonel Victor Olivier de Puymanel in 1790, and the plan carries a key from A to V marking the king's and the queen's palaces, the granary, the shipyard, the barracks and the other works around it.

Note on the source: Trung tâm Lưu trữ quốc gia II publishes this same plate at nac2.gov.vn/csdl/bando/1.html captioned as a 1 March 1859 sketch by De Larclause. The cartouche on the sheet itself reads Brun and Dayot, 1799, and the impression carries a Bibliothèque nationale de France stamp.$t$
 where id = '603210b8-8b1f-4ed6-b421-d43b960c39db';

-- 1862 Coffyn
update public.maps set dc_description = $t$Saigon's earliest city plan: Lieutenant-Colonel Coffyn's 1862 design for half a million people. Every colonial plan for Saigon and Chợ Lớn that followed starts here.

Coffyn, of the engineers, drew it for a city of 500,000 to 600,000, joining Bến Nghé in the east to Saigon — today's Chợ Lớn — in the west. It sets an administrative quarter around the Gia Định citadel, holding the governor's residence, the barracks, the military hospital and the shipyard, against a commercial quarter over the rest. Its main proposals were a defensive canal to the west, begun in November 1862 and 6 km long, later the Vành Đai; a central lake 426 m across that was never dug; the half-moon Primauguet square on the river, now Công trường Mê Linh; and keeping the Kinh Lớn and eight old roads intact.

Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/5.html. The original is held at the Archives nationales d'outre-mer (ANOM).$t$
 where id = 'f9b3c9b2-5a11-4e8a-8b11-c988b28ae6d3';

-- 1863 Plan du port de Saigon
update public.maps set dc_description = $t$Channel soundings of the port reach of the Saigon river, surveyed in 1863 by the naval engineers Vidalin and Héraud, four years after the citadel fell.

F. Vidalin (1831–1887) and G. Héraud (1839–1914) surveyed it on Rear-Admiral de La Grandière's orders; the Dépôt des cartes et plans published it in 1866. It covers the port and part of the Bến Nghé creek, with the tide notes for 1863, and marks the commercial port, the naval yard with its arsenal and floating dock, and the Observatoire mast raised by Rear-Admiral Bonard — the ancestor of today's Thủ Ngữ flagpole. The seat of government sits inside four streets now called Hai Bà Trưng, Nguyễn Du, Pasteur and Lý Tự Trọng. The Phụng citadel still stands, abandoned since 1859, and the streets are still numbered: they were not named until the decree of 1 February 1865.

Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/6.html$t$
 where id = 'e0aaf392-ea00-4838-b461-8e49d34dd939';

-- 1882 Plan topographique du 20e Arrondissement
update public.maps set dc_description = $t$A 1:20,000 survey of the 20th arrondissement — an administrative unit that lasted under eight years, and whose boundaries every later change to Saigon and Chợ Lớn was drawn against.

It was created by a decree of the Governor of Cochinchina on 13 December 1880 and dissolved on 12 January 1888, split into the canton of Bình Chánh Thượng to the north, ten villages, and Dương Minh to the south, thirteen. The sheet records each village boundary as it stood in 1882 in fine detail, with roads, waterways, communal houses, pagodas, ferry landings and forts, running from Saigon, Chợ Lớn and Bình Hòa out to Gò Vấp, and from Chợ Lớn through Thị Nghè to Thủ Đức.

Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/15.html$t$
 where id = '3d065384-bb09-4b8c-b46b-bf006d0c3ba3';

-- 1959 Đô thành Sài Gòn
update public.maps set dc_description = $t$The most detailed map of urban Saigon and Chợ Lớn of its period: 384 named streets at 1:10,000, and the eight districts created that March.

The plan names 384 boulevards, streets, quays, lanes and squares with 156 keyed locations. The districts are those of decree 110-NV of 27 March 1959, a division far closer to today's than the one of 1952 and the basis for the districts that followed; the eight were subdivided into 41 wards soon after. The satellite quarters of Phú Nhuận, Bình Hòa, Thị Nghè and Thủ Thiêm are visibly taking shape, while District 4 is still largely fields and canals.

Published by Nha Địa-Dư Quốc-Gia as the second edition: revised in 1956 from French Geographic Institute aerial photography flown in 1953 at 1:15,000, with survey additions inside the city in 1957, and reissued in 1959. Summarised from the caption at Trung tâm Lưu trữ quốc gia II, nac2.gov.vn/csdl/bando/38.html, and from the Virtual Saigon record (ID 855, IAO Map Collection).$t$
 where id = '34d4edb2-f7df-4c47-a65a-f6b471400396';
