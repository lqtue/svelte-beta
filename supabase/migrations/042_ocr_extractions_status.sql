-- Add validation tracking to ocr_extractions.
-- status: 'pending' (raw from model) → 'validated' (human-confirmed) | 'rejected' (false positive)
-- Validated rows become the OCR ground truth dataset.

alter table ocr_extractions
  add column if not exists status         text not null default 'pending',
  add column if not exists validated_at   timestamptz,
  add column if not exists validated_by   uuid references auth.users(id);

-- Optional: allow storing the human-corrected text/category separately from the raw model output
alter table ocr_extractions
  add column if not exists text_validated     text,
  add column if not exists category_validated text;

create index if not exists ocr_extractions_status_idx
  on ocr_extractions (map_id, status);

-- Authenticated admins can update validation fields
-- (INSERT/DELETE still restricted to service_role via the existing policy)
create policy "ocr_extractions_auth_validate"
  on ocr_extractions for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
