-- 076: store the label's own rectangle, not just the box around it.
--
-- `global_*` is the axis-aligned bounding box of text that may run at any angle,
-- and `rotation_deg` is the angle. Those two are enough to *derive* the rotated
-- strip the lettering occupies (invert w = W|cos| + H|sin|, h = W|sin| + H|cos|),
-- and that is how the review UI drew it — but a derived size is not an editable
-- one: changing only the angle changes the derived strip, so the rotation handle
-- resized the label as it turned it, and at 45 degrees the box is square whatever
-- the label is, so the size cannot be read back at all.
--
-- `label_w` (along the text) and `label_h` (across it) make the rotated rectangle
-- the stored object. `global_*` stays exactly what it was — the axis-aligned box
-- around it, kept in step on every write — because the SAM2 seeding, the label
-- join and the place-time warp all read it.
--
-- Nullable and not backfilled on purpose: null means "the box and the angle are
-- all we have", which is also true of every row the OCR pipeline writes, so the
-- reader needs that fallback either way. The first edit of a row fills them in.
alter table ocr_extractions
  add column if not exists label_w double precision,
  add column if not exists label_h double precision;

comment on column ocr_extractions.label_w is
  'Length of the label along its own text direction, px. Null = derive from global_w/h + rotation_deg.';
comment on column ocr_extractions.label_h is
  'Thickness of the label across its text direction, px. Null = derive from global_w/h + rotation_deg.';
