#!/usr/bin/env python3
"""vma-worker — claims pipeline_jobs and runs them.

Any machine with the OCR venv can run this; the queue decides who gets what.

    source work/ocr/.venv/bin/activate
    python work/worker/vma_worker.py --kinds ocr --worker macbook-m1
    python work/worker/vma_worker.py --once          # drain one job and exit

Claiming goes through the claim_job() RPC (FOR UPDATE SKIP LOCKED), so running
several workers against the same kinds needs no coordination between them.

Credentials come from the repo-root .env: PUBLIC_SUPABASE_URL and
SUPABASE_SERVICE_KEY. Step 2 of docs/architecture-target.md replaces those with
a per-machine worker key and an /api/pipeline/results endpoint.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
OCR_SCRIPT = REPO_ROOT / "work" / "ocr" / "scripts" / "ocr.py"


def _config() -> tuple[str, str]:
    try:
        from dotenv import load_dotenv

        load_dotenv(REPO_ROOT / ".env")
    except ImportError:
        pass
    url = os.environ.get("PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        sys.exit("Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
    return url, key


def _rpc(name: str, args: dict) -> dict | None:
    url, key = _config()
    resp = requests.post(
        f"{url}/rest/v1/rpc/{name}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        data=json.dumps(args),
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    # claim_job returns a null-filled row rather than NULL when the queue is empty.
    return body if isinstance(body, dict) and body.get("id") else None


def ocr_argv(job: dict, python_bin: str) -> list[str]:
    """Turn an `ocr` job payload into the ocr.py batch command line."""
    p = job["payload"]
    argv = [
        python_bin,
        str(OCR_SCRIPT),
        "batch",
        "--map-id", job["map_id"],
        "--run-id", p["run_id"],
        "--tile-size", str(p.get("tile_size", 2400)),
        "--overlap", str(p.get("overlap", 600)),
        "--concurrency", str(p.get("concurrency", 3)),
        "--min-confidence", str(p.get("min_confidence", 0.5)),
        "--db",
    ]
    neatline = p.get("neatline")
    if neatline:
        argv += ["--crop", ",".join(str(n) for n in neatline)]
    if p.get("auto", True):
        if not neatline:
            argv.append("--scout")  # a drawn neatline already pins the crop
        argv.append("--legend")
    if p.get("target_calls"):
        argv += ["--target-calls", str(p["target_calls"])]
    if p.get("prior_run"):
        argv += ["--prior-run", str(p["prior_run"])]
    if p.get("tile_overrides"):
        argv += ["--tile-overrides", json.dumps(p["tile_overrides"])]
    return argv


RUNNERS = {"ocr": ocr_argv}


def run_job(job: dict, python_bin: str) -> None:
    kind = job["kind"]
    build = RUNNERS.get(kind)
    if build is None:
        _rpc("finish_job", {
            "p_id": job["id"],
            "p_status": "failed",
            "p_error": f"this worker does not run {kind} jobs",
        })
        print(f"[{kind}] {job['id']} rejected — not runnable here")
        return

    argv = build(job, python_bin)
    print(f"[{kind}] {job['id']} running: {' '.join(argv)}")
    _rpc("finish_job", {"p_id": job["id"], "p_status": "running"})

    try:
        proc = subprocess.run(argv, cwd=REPO_ROOT, capture_output=True, text=True)
    except OSError as e:
        # A missing interpreter or script would otherwise leave the job stuck in
        # 'running' with nobody to claim it again.
        _rpc("finish_job", {"p_id": job["id"], "p_status": "failed", "p_error": str(e)})
        print(f"[{kind}] {job['id']} FAILED to start: {e}")
        return

    if proc.returncode == 0:
        tail = proc.stdout.strip().splitlines()[-1:] or [""]
        _rpc("finish_job", {
            "p_id": job["id"],
            "p_status": "done",
            "p_result": {"returncode": 0, "last_line": tail[0][:500]},
        })
        print(f"[{kind}] {job['id']} done")
    else:
        # Keep the tail: the whole log would not fit a jsonb column comfortably,
        # and the last few lines are what actually says why it died.
        err = (proc.stderr or proc.stdout or "").strip()[-2000:]
        _rpc("finish_job", {
            "p_id": job["id"],
            "p_status": "failed",
            "p_result": {"returncode": proc.returncode},
            "p_error": err,
        })
        print(f"[{kind}] {job['id']} FAILED rc={proc.returncode}\n{err[-500:]}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Claim and run VMA pipeline jobs.")
    ap.add_argument("--kinds", default="ocr", help="comma-separated job kinds to claim (default: ocr)")
    ap.add_argument("--worker", default=os.uname().nodename, help="name recorded on the claim")
    ap.add_argument("--interval", type=float, default=10.0, help="seconds between polls when idle")
    ap.add_argument("--once", action="store_true", help="run at most one job, then exit")
    ap.add_argument("--python", default=sys.executable, help="interpreter for the pipeline scripts")
    args = ap.parse_args()

    kinds = [k.strip() for k in args.kinds.split(",") if k.strip()]
    print(f"vma-worker {args.worker} polling {kinds} every {args.interval}s")

    while True:
        try:
            job = _rpc("claim_job", {"p_kinds": kinds, "p_worker": args.worker})
        except requests.RequestException as e:
            print(f"claim failed: {e}")
            job = None

        if job:
            run_job(job, args.python)
            if args.once:
                return
        else:
            if args.once:
                print("queue empty")
                return
            time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nstopped")
