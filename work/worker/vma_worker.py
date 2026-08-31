#!/usr/bin/env python3
"""vma-worker — claims pipeline_jobs and runs them.

Any machine with the OCR venv can run this; the queue decides who gets what.

    source work/ocr/.venv/bin/activate
    python work/worker/vma_worker.py --kinds ocr --worker macbook-m1
    python work/worker/vma_worker.py --once          # drain one job and exit

Claiming goes through /api/pipeline/claim, which runs the claim_job() RPC
(FOR UPDATE SKIP LOCKED) server-side, so running several workers against the
same kinds needs no coordination between them.

The worker holds no database credentials. It needs two variables, from the
environment or the repo-root .env:

    VMA_API_URL      https://maparchive.vn  (or http://localhost:5173 in dev)
    VMA_WORKER_KEY   minted by scripts/mint-worker-key.mjs

They are passed down to the pipeline scripts too, so ocr.py writes its rows
through the same endpoint.
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
    url = os.environ.get("VMA_API_URL", "").rstrip("/")
    key = os.environ.get("VMA_WORKER_KEY", "")
    if not url or not key:
        sys.exit(
            "Set VMA_API_URL and VMA_WORKER_KEY (mint one with "
            "`node --env-file=.env scripts/mint-worker-key.mjs <name>`)"
        )
    return url, key


def _post(path: str, body: dict) -> dict:
    url, key = _config()
    resp = requests.post(
        f"{url}{path}",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        data=json.dumps(body),
        timeout=30,
    )
    if resp.status_code in (401, 403):
        sys.exit(f"worker key rejected: {resp.status_code} {resp.text[:200]}")
    resp.raise_for_status()
    return resp.json()


def execute(job_id: str) -> dict:
    """Ask the server to run a job whose work needs the service key."""
    return _post("/api/pipeline/execute", {"job_id": job_id})


def claim(kinds: list[str], worker: str) -> dict | None:
    return _post("/api/pipeline/claim", {"kinds": kinds, "worker": worker}).get("job")


def finish(job_id: str, status: str, result: dict | None = None, err: str | None = None) -> None:
    _post(
        "/api/pipeline/results",
        {"job_id": job_id, "status": status, "result": result or {}, "error": err},
    )


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


def tile_argv(job: dict, python_bin: str) -> list[str]:
    """Turn a `tile_to_r2` job into the tiling script's command line.

    scripts/tile_map.sh needs vips and rclone with R2 credentials, so this only
    runs on a machine set up for it — `--kinds ocr` (the default) skips it.
    """
    iiif = job["payload"].get("iiif_image", "").rstrip("/")
    if not iiif:
        raise ValueError("tile_to_r2 job has no iiif_image in its payload")
    # Gallica serves the full image under a different quality name.
    download = f"{iiif}/full/full/0/native.jpg" if "gallica.bnf.fr" in iiif else f"{iiif}/full/max/0/default.jpg"
    return [str(REPO_ROOT / "scripts" / "tile_map.sh"), job["map_id"], download, iiif]


# Kinds this worker runs itself. mirror_annotation and sync_allmaps are not
# here: they need the service key, so the server runs them (see execute()).
RUNNERS = {"ocr": ocr_argv, "tile_to_r2": tile_argv}
SERVER_KINDS = {"mirror_annotation", "sync_allmaps"}


def run_job(job: dict, python_bin: str) -> None:
    kind = job["kind"]
    if kind in SERVER_KINDS:
        print(f"[{kind}] {job['id']} handing to the server")
        try:
            execute(job["id"])
            print(f"[{kind}] {job['id']} done")
        except requests.RequestException as e:
            # /api/pipeline/execute already closed the job out; this is just the
            # local report of it.
            print(f"[{kind}] {job['id']} FAILED: {e}")
        return

    build = RUNNERS.get(kind)
    if build is None:
        finish(job["id"], "failed", err=f"this worker does not run {kind} jobs")
        print(f"[{kind}] {job['id']} rejected — not runnable here")
        return

    try:
        argv = build(job, python_bin)
    except (KeyError, ValueError) as e:
        finish(job["id"], "failed", err=f"bad job payload: {e}")
        print(f"[{kind}] {job['id']} rejected — {e}")
        return

    print(f"[{kind}] {job['id']} running: {' '.join(argv)}")
    finish(job["id"], "running")

    # The pipeline scripts write through the same endpoint with the same key.
    api_url, api_key = _config()
    env = {**os.environ, "VMA_API_URL": api_url, "VMA_WORKER_KEY": api_key}

    try:
        proc = subprocess.run(argv, cwd=REPO_ROOT, capture_output=True, text=True, env=env)
    except OSError as e:
        # A missing interpreter or script would otherwise leave the job stuck in
        # 'running' with nobody to claim it again.
        finish(job["id"], "failed", err=str(e))
        print(f"[{kind}] {job['id']} FAILED to start: {e}")
        return

    if proc.returncode == 0:
        tail = proc.stdout.strip().splitlines()[-1:] or [""]
        finish(job["id"], "done", {"returncode": 0, "last_line": tail[0][:500]})
        print(f"[{kind}] {job['id']} done")
    else:
        # Keep the tail: the whole log would not fit a jsonb column comfortably,
        # and the last few lines are what actually says why it died.
        err = (proc.stderr or proc.stdout or "").strip()[-2000:]
        finish(job["id"], "failed", {"returncode": proc.returncode}, err)
        print(f"[{kind}] {job['id']} FAILED rc={proc.returncode}\n{err[-500:]}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Claim and run VMA pipeline jobs.")
    ap.add_argument(
        "--kinds",
        default="ocr",
        help="comma-separated job kinds to claim: ocr, tile_to_r2, mirror_annotation, sync_allmaps (default: ocr)",
    )
    ap.add_argument("--worker", default=os.uname().nodename, help="name recorded on the claim")
    ap.add_argument("--interval", type=float, default=10.0, help="seconds between polls when idle")
    ap.add_argument("--once", action="store_true", help="run at most one job, then exit")
    ap.add_argument("--python", default=sys.executable, help="interpreter for the pipeline scripts")
    args = ap.parse_args()

    kinds = [k.strip() for k in args.kinds.split(",") if k.strip()]
    print(f"vma-worker {args.worker} polling {kinds} every {args.interval}s")

    while True:
        try:
            job = claim(kinds, args.worker)
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
