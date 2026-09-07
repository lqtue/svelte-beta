#!/usr/bin/env python3
"""Does the prompt the run selected actually reach the model?

Until 2026-09-08 it did not: `extract_labels_sequence` had a hardcoded fallback
prompt naming an "1882 Saigon cadastral map", `cmd_batch` passed no prompt, and the
row-sequence path — the production default — sent the fallback while recording
`"prompt": "v8"` in every tile's `_meta`. These asserts are the smallest thing that
fails if that comes back. No API calls, no network.

    python test_prompt_plumbing.py
"""
import inspect
import re
from pathlib import Path

import gemini_client
from prompt import DEFAULT_PROMPT, PROMPTS, SYSTEM_PROMPT, sequence_frame_rules

# 1. The sequence call cannot be made without a prompt — no silent fallback.
sig = inspect.signature(gemini_client.extract_labels_sequence)
assert sig.parameters["user_prompt"].default is inspect.Parameter.empty, \
    "user_prompt has a default again — a caller can now silently get someone else's prompt"

# 2. Every caller passes one. (Checked in source: the calls are inside long CLI
#    subcommands that need a IIIF endpoint and an API key to reach.)
src = Path("ocr.py").read_text()
calls = re.findall(r"extract_labels_sequence\((.*?)\n\s*\)", src, re.S)
assert len(calls) == 3, f"expected 3 sequence call sites in ocr.py, found {len(calls)}"
for i, args in enumerate(calls):
    assert "user_prompt=" in args, f"sequence call site {i} passes no user_prompt"

# 3. Nothing on the live path asserts which sheet this is. Retired prompt versions
#    (v7 names Saigon's 1882 numbered streets) are left as they were, so an old run
#    stays reproducible; the year examples in PROMPT_SCOUT's `year` field are values
#    to return, not claims about the sheet.
live = {"SYSTEM_PROMPT": SYSTEM_PROMPT,
        "sequence_frame_rules": sequence_frame_rules(3),
        f"PROMPTS[{DEFAULT_PROMPT}]": PROMPTS[DEFAULT_PROMPT]}
for name, text in live.items():
    for claim in ("1882 Saigon", "1882 French", "an 1882"):
        assert claim not in text, f"{name} hardcodes {claim!r} — it is sent for 1968 sheets too"

# 4. The system prompt primes both corpora, and asks for diacritics.
for token in ("French", "Vietnamese", "quốc ngữ", "ĐƯỜNG", "Diacritics"):
    assert token in SYSTEM_PROMPT, f"SYSTEM_PROMPT no longer mentions {token!r}"

# 5. The frame rules address frames, and say how many.
rules = sequence_frame_rules(4)
assert "frame_idx" in rules and "4 frames" in rules, "frame rules lost frame addressing"
assert "prior knowledge" in rules, \
    "frame rules no longer bound joining to visible text — v8 forbids reconstruction"

# 6. Prompt before image, on both live call paths. Implicit context caching
#    keys on a stable prefix; image-first made the prefix the one part that
#    changes every call, so the ~1.5k-token prompt was billed in full each time.
gsrc = Path("gemini_client.py").read_text()
assert "[user_prompt, image_part]" in gsrc, \
    "extract_labels sends the image before the prompt again — no cache prefix"
assert "[sequence_prompt] + parts" in gsrc, \
    "extract_labels_sequence sends the frames before the prompt again — no cache prefix"
assert gsrc.count("_cached_prefix(client, active_key, model, system_prompt") == 2, \
    "a live call path stopped asking for the explicit prefix cache"

print("prompt plumbing OK")
