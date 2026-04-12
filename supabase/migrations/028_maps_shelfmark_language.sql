-- Add shelfmark and language columns to maps.
-- shelfmark: archival shelf mark / call number (e.g. BnF "GE SH 19 PF 1 QUATER DIV 21 P 34")
-- language: language(s) of the map text (e.g. "français", "vi")
-- physical_description: format / dimensions from IIIF manifest (e.g. "67 x 57 cm, en 3 coul.")

alter table maps
  add column if not exists shelfmark text,
  add column if not exists language text,
  add column if not exists physical_description text;
