"""Normalising a printed place label so two readings of it can be compared.

Lives apart from `ocr.py` because three things need it and only one of them
should have to import the Gemini SDK: the dedupe in `ocr.py`, the index-agreement
score in `eval_metrics.py`, and the tests. Duplicating it instead would put the
same folding rules in two files, and a drift between them would not look like a
bug — it would look like a sheet whose streets simply did not match its own
printed index.
"""

from __future__ import annotations

import unicodedata

# The generic half of a place label, in both languages the corpus prints.
# Ordered longest first: the two-word generics have to be tried before their
# first word is taken on its own.
LABEL_PREFIXES: tuple[str, ...] = (
    "cong truong", "công trường", "dai lo", "đại lộ", "quoc lo", "quốc lộ",
    "huong lo", "hương lộ",
    "duong", "đường", "ben", "bến", "rach", "rạch", "kinh", "song", "sông",
    "cau", "cầu", "hem", "hẻm", "xom", "xóm", "ap", "ấp", "ngo", "ngõ",
    "rue", "ruelle", "impasse", "passage", "allee", "allée", "avenue",
    "boulevard", "bd", "quai", "chemin", "place", "cour", "hameau", "route",
    "voie", "pont", "sentier",
)


def fold(s: str) -> str:
    """Lowercase, diacritics off, and both `đ` and the `ð` the model sometimes
    returns for it down to `d`. Vietnamese names are two or three short
    syllables, so one dropped tone mark costs a character-level ratio more than
    the difference between two unrelated names does."""
    s = s.lower().replace("đ", "d").replace("ð", "d")
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def label_core(text: str) -> str:
    """The distinguishing part of a label: its name, with the generic prefix cut.

    On a Vietnamese sheet the prefix is most of the string. "Đại Lộ Lê Lợi" and
    "Đại Lộ Hàm Nghi" share two of their four words and eight of thirteen
    characters — enough for a word-overlap test to call two different boulevards
    one label. Comparing "lê lợi" against "hàm nghi" is what keeps them apart.

    Exactly one prefix comes off. Stripping every leading generic in a run turns
    "Rạch Bến Nghé" into "Nghé" and throws away the name, because "Bến" is a
    generic in its own right and part of this name in particular.

    A label that is nothing but a generic returns "": it names no place, and an
    empty core is a substring of everything, so callers must treat it as "no
    core" rather than as a match.
    """
    t = " ".join(text.lower().split())
    if t in LABEL_PREFIXES:
        return ""
    for p in LABEL_PREFIXES:
        if t.startswith(p + " "):
            return t[len(p) + 1:]
    return t


def name_key(text: str) -> str:
    """The key two readings of one street agree on: folded, prefix-stripped.

    What `eval_metrics.score_index_agreement` matches a body label to a printed
    directory row by. Deliberately not `_text_similar`: that predicate is built
    to be generous, and a scoring pass wants an exact key so a wrong match
    cannot inflate the number it reports.
    """
    return " ".join(fold(label_core(text)).split())


def _self_check() -> None:
    assert label_core("Đại Lộ Lê Lợi") == "lê lợi"
    assert label_core("Rue Catinat") == "catinat"
    # One prefix, not a run: Bến Nghé is the name of this canal.
    assert label_core("Rạch Bến Nghé") == "bến nghé"
    # Nothing but a generic has no core.
    assert label_core("Đường") == "" and label_core("Đại Lộ") == ""
    assert fold("ĐƯỜNG") == "duong" and fold("Rạch") == "rach"
    # The two spellings of Đ the models return fold together.
    assert fold("Đông") == fold("Ðông") == "dong"
    # One street, two readings, one key.
    assert name_key("Đại Lộ Lê Lợi") == name_key("Lê Lợi") == "le loi"
    assert name_key("Đường Nguyễn Huệ") != name_key("Đường Nguyễn Trãi")
    print("[ok] labels self-check passed")


if __name__ == "__main__":
    _self_check()
