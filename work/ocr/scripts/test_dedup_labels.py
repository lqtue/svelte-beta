"""Does the dedupe still tell two streets apart?

The 1959 Saigon sheet lost Lê Lợi, Hàm Nghi, Công Lý and Phan Chu Trinh to
`_text_similar`, which read "Đại Lộ Lê Lợi" and "Đại Lộ Hàm Nghi" as one label
because they share the prefix. The surviving row count still looked right — 367
street names against the sheet's own claim of 384 — so nothing failed. These
pairs are what fails instead.

    python3 test_dedup_labels.py
"""

from ocr import _text_similar, _label_core, _close_px, _name_like

# Different streets. Every one of these was collapsed before the prefix strip.
DIFFERENT = [
    ("Đại Lộ Lê Lợi", "Đại Lộ Hàm Nghi"),
    ("Đại Lộ Lê Lợi", "Đại Lộ Lê Lai"),
    ("Đường Công Lý", "Đường Công Quỳnh"),
    ("Đại Lộ Hùng Vương", "Đại Lộ Hồng Bàng"),
    ("Đường Tự Do", "Đường Tự Đức"),
    ("Đường Phan Chu Trinh", "Đường Phan Đình Phùng"),
    ("Đường Nguyễn Huệ", "Đường Nguyễn Trãi"),
    ("Đường Nguyễn Trung Ngạn", "Đường Nguyễn Duy Dương"),
    ("Bến Chương Dương", "Bến Vân Đồn"),
    ("Rạch Bến Nghé", "Rạch Thị Nghè"),
    ("Rue Catinat", "Rue Charner"),
    # A bare syllable is not a fragment of one particular street: it matched
    # every street carrying it, and union-find then chained them into one row.
    ("Trần", "Đại Lộ Trần Quốc Toản"),
    ("Lâm", "Đường Nguyễn Lâm"),
    # A bare generic is inside every street on the sheet: one such row chained
    # 43 of them into a single cluster.
    ("Đường", "Đường Lê Đại Hành"),
    ("Đại Lộ", "Đại Lộ Lý Thái Tổ"),
    ("Rue", "Rue Catinat"),
]

# One street, read twice: prefix dropped by one tile, diacritics or a character
# lost by the model, case and spacing wandering.
SAME = [
    ("Đại Lộ Lê Lợi", "Lê Lợi"),
    ("Đại Lộ Lê Lợi", "ĐẠI LỘ LÊ LỢI"),
    ("Đường Nguyễn Huệ", "Đường Nguyễn Huê"),
    ("Đường Phan Chu Trinh", "Phan Chu Trinh"),
    ("Đại Lộ Trần Hưng Đạo", "Đại lộ Trần Hưng Ðạo"),
    ("Rue Catinat", "Catinat"),
    ("Bến Bình Đông", "Bến Bình Ðông"),
]

for a, b in DIFFERENT:
    assert not _text_similar(a, b), f"collapsed two streets: {a!r} + {b!r}"
for a, b in SAME:
    assert _text_similar(a, b), f"split one street: {a!r} + {b!r}"

# A label that is only a generic names no place, so it has no core at all and
# `_text_similar` falls back to comparing whole strings.
assert _label_core("Đường") == ""
assert _label_core("Đại Lộ Lê Lợi") == "lê lợi"
assert not _text_similar("Đường", "Đại Lộ Lê Lợi")

# Proximity scales with the text's height, not its length: a 600×80 street
# label reaches two line-heights, not most of a block.
assert _close_px((0, 0, 600, 80), (0, 0, 600, 80)) == 320.0

# A name stands alone at two syllables, or one long one.
assert _name_like("cho lon") and _name_like("catinat")
assert not _name_like("tran") and not _name_like("lam")

print(f"ok — {len(DIFFERENT)} pairs kept apart, {len(SAME)} pairs joined")
