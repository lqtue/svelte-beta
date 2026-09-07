#!/usr/bin/env python3
"""Does the cross-run merge keep agreement over self-confidence?

The smallest thing that fails if `ensemble_items` goes back to picking the
loudest prediction. No network, no API.

    python test_ensemble.py
"""
from ocr import ensemble_items

# Three passes see one label. Two agree on the printed spelling with a decent
# box; the third "expanded" it, drew a bad box, and is certain about it.
items = [
    {"text": "Vge de Phú Mỹ", "global_bbox": (100, 100, 400, 60), "confidence": 0.95, "_run": "a"},
    {"text": "Vge de Phú Mỹ", "global_bbox": (105, 102, 395, 58), "confidence": 0.90, "_run": "b"},
    {"text": "Village de Phú Mỹ", "global_bbox": (60, 90, 520, 90), "confidence": 1.00, "_run": "c"},
    # An unrelated label far away, seen once.
    {"text": "ABATTOIR", "global_bbox": (3000, 3000, 300, 50), "confidence": 0.8, "_run": "a"},
]
out = ensemble_items(items)
assert len(out) == 2, out
merged = next(e for e in out if "Phú" in e["text"])
assert merged["text"] == "Vge de Phú Mỹ", merged["text"]          # majority spelling, not the loud one
assert merged["global_bbox"] in {(100, 100, 400, 60), (105, 102, 395, 58)}, merged["global_bbox"]
assert merged["n_passes"] == 3
solo = next(e for e in out if e["text"] == "ABATTOIR")
assert solo["n_passes"] == 1

# Two different labels that share a street axis but sit apart must NOT merge.
apart = [
    {"text": "Hamelin", "global_bbox": (0, 0, 300, 50), "confidence": 0.9, "_run": "a"},
    {"text": "Batavia", "global_bbox": (900, 0, 300, 50), "confidence": 0.9, "_run": "b"},
]
assert len(ensemble_items(apart)) == 2
print("ensemble OK")
