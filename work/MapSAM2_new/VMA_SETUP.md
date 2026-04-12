# VMA × MapSAM2 — Setup Guide

## Database Snapshot (2026-04-04)

**Supabase URL:** `https://trioykjhhwrruwjsklfo.supabase.co`

### Available Training Data

| Map Name | Map ID | Footprints | Status |
|----------|--------|-----------|--------|
| Plan Cadastral de la ville de Saigon, Cochinchine Française (1882) | `3d065384-bb09-4b8c-b46b-bf006d0c3ba3` | 46 | submitted |

**Total: 46 building footprints ready for fine-tuning**

---

## Notebook Configuration

The notebook now fetches data **directly from Supabase** — no local server or ngrok needed.

### Cell 1 — Pre-filled values (no changes needed):

```python
# ── Supabase (public read-only) ───────────────────────────────────────────────
SUPABASE_URL      = 'https://trioykjhhwrruwjsklfo.supabase.co'
SUPABASE_ANON_KEY = '...'  # already set in notebook

# ── Training data ─────────────────────────────────────────────────────────────
MAP_ID = '0e02b9d9-9d40-4cca-8e41-8c8373d54d3b'
STATUS = 'submitted'    # Use the 46 available footprints

# ── Training ─────────────────────────────────────────────────────────────────
TRAIN_SPLIT  = 0.8
EPOCHS       = 20
LR           = 1e-4
LORA_RANK    = 4
BATCH_SIZE   = 1     # Keep at 1 for T4; increase for A100

# ── Checkpoint ───────────────────────────────────────────────────────────────
CKPT_NAME   = 'sam2_hiera_small'
ENCODER     = 'vit_s'
SAM_CONFIG  = 'sam2_hiera_s'

# ── Colab paths ──────────────────────────────────────────────────────────────
MAPSAM2_DIR  = '/content/MapSAM2'
DATA_DIR     = '/content/vma_dataset'
CKPT_PATH    = f'{MAPSAM2_DIR}/checkpoints/{CKPT_NAME}.pt'

USE_DRIVE   = False  # Set to True to cache across Colab sessions
```

---

## How to Run

### 1. Upload Notebook to Google Colab

1. Go to [https://colab.research.google.com](https://colab.research.google.com)
2. Upload `work/MapSAM2_new/vma_mapsam2_training.ipynb`
3. Change runtime to **GPU** (Runtime → Change runtime type → GPU → T4)

> **No local server needed.** The notebook queries Supabase directly using
> the public anon key, then fetches IIIF crop URLs via Allmaps — all from
> within Colab.

### 2. Run All Cells

The notebook will:
- Cell 4: Fetch 46 footprints directly from Supabase + build COCO dataset
- Cell 5: Download IIIF crops and render binary masks
- Cell 6: Fine-tune SAM2 with LoRA (20 epochs)
- Cell 7–8: Evaluate and visualize results
- Cell 9: Optionally save model to Google Drive

---

## Expected Output

**Training should complete in ~2–5 minutes (T4 GPU, 46 samples, 20 epochs)**

Metrics to watch:
- **Loss**: aim for < 0.2
- **Dice**: aim for > 0.7 (reasonable for small dataset)
- **eIoU**: aim for > 0.6

---

## Troubleshooting

### `No footprints returned` error
- Check `MAP_ID` matches the table above (it is pre-filled correctly)
- Verify `STATUS` — try `'submitted'` if using another value
- Check Supabase is reachable: `requests.get(SUPABASE_URL).status_code` should be 200

### Network timeout downloading IIIF crops
- Increase timeout in Cell 5: `timeout=60` → `timeout=120`
- Or enable `USE_DRIVE = True` to cache locally

### Out of memory on T4
- Reduce `BATCH_SIZE` to 1 (already set)
- Reduce `TRAIN_SPLIT` to 0.6 for smaller validation set

---

## Next Steps

After training:
1. Download the best checkpoint from Colab (Cell 9)
2. Run inference on new maps using `train_2d.py -test` flag
3. Convert predicted masks back to WGS84 using Allmaps georef data
4. Submit as `status=needs_review` footprints for volunteer review

See `TECHNICAL.md` for architecture details.
