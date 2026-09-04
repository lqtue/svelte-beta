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
        # The one that decides whether a street name is legible. Each tile is
        # `tile_size` source pixels rendered down to `render_size` before the
        # model sees it, so the effective ground resolution is the sheet's
        # own m/px times tile_size/render_size. The defaults are 2400/1024 —
        # a 2.34x downsample on top of the scan, which put the 1959 Saigon
        # sheet in front of Gemini at ~6.5 m/px. Equal values are 1:1, the
        # source ceiling; larger only upsamples and buys nothing.
        "--render-size", str(p.get("render_size", 1024)),
        "--concurrency", str(p.get("concurrency", 3)),
        "--min-confidence", str(p.get("min_confidence", 0.5)),
        "--db",
    ]
    # Left unset, every queued job silently inherits gemini_client.DEFAULT_MODEL,
    # which is invisible from the job row. Passing it explicitly means the run's
    # calls.jsonl and the payload agree about what was used.
    if p.get("model"):
        argv += ["--model", str(p["model"])]
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


def layout_argv(job: dict, python_bin: str) -> list[str]:
    """Turn a `layout` job into the scout command line.

    The layout pass is scout with `--save-triage`: one low-resolution look at the
    whole sheet, asking the model where the main map, title, legend, name list
    and furniture are, written to maps.triage.regions for a person to correct on
    the digitalize canvas. It is a job rather than a route because the Gemini key
    lives here and deliberately not in the web app.
    """
    p = job["payload"]
    argv = [
        python_bin,
        str(OCR_SCRIPT),
        "scout",
        "--map-id", job["map_id"],
        "--render-size", str(p.get("render_size", 2048)),
        "--save-triage",
    ]
    if p.get("run_id"):
        argv += ["--run-id", str(p["run_id"])]
    if p.get("model"):
        argv += ["--model", str(p["model"])]
    if p.get("preview"):
        argv.append("--preview")
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


def seg_argv(job: dict, python_bin: str) -> list[str]:
    """Turn a `seg` job into the MapSAM2 inference command line.

    This is the one runner whose machine is normally not a laptop: MapSAM2 wants
    a GPU, so the intended host is a Colab notebook running this same worker
    with `--kinds seg`. A GPU session becomes a worker, and nothing has to be
    copy-pasted out of the Segmentation panel any more.

    The flag set mirrors `src/lib/features/contribute/digitalize/segCommand.ts`,
    which is what that panel shows a human — keep the two in step. With a
    validated OCR run the model runs LoRA-prompted off those toponyms; without
    one it falls back to automatic mode, exactly as the panel does.

    ponytail: checkpoint and MapSAM2 directory come from the environment, since
    they are properties of the machine rather than of the job. A job may still
    override either in its payload.
    """
    p = job["payload"]
    mapsam2_dir = p.get("mapsam2_dir") or os.environ.get("MAPSAM2_DIR", "/content/MapSAM2")
    checkpoint = p.get("checkpoint") or os.environ.get(
        "MAPSAM2_CHECKPOINT", "/content/drive/MyDrive/mapsam2_checkpoint.pth"
    )
    ocr_run_id = p.get("ocr_run_id")

    argv = [
        python_bin,
        str(REPO_ROOT / "work" / "MapSAM2" / "inference_tiles_as_video.py"),
        "--map-id", job["map_id"],
        "--checkpoint", checkpoint,
        "--encoder", str(p.get("encoder", "vit_s")),
    ]
    if ocr_run_id:
        argv += ["--lora", "--mapsam2-dir", mapsam2_dir,
                 "--mode", "prompted", "--ocr-run-id", str(ocr_run_id)]
    else:
        argv += ["--mode", "automatic"]
    argv += [
        "--tile-size", str(p.get("tile_size", 1024)),
        "--overlap", str(p.get("overlap", 128)),
        "--device", str(p.get("device", "cuda")),
        "--out-json", "footprints.json",
        "--write-supabase",
    ]
    if p.get("text_mask", True):
        argv.append("--text-mask")
    if p.get("watershed", True):
        argv.append("--watershed")
    if p.get("run_id"):
        argv += ["--run-id", str(p["run_id"])]
    return argv


def join_argv(job: dict, python_bin: str) -> list[str]:
    """Turn a `join` job into the label↔footprint join command line.

    Run ids are optional: join_labels pins the newest run on each side when it
    is not told which ones to use.
    """
    p = job["payload"]
    argv = [python_bin, str(REPO_ROOT / "work" / "ocr" / "scripts" / "join_labels.py"), job["map_id"]]
    if p.get("ocr_run_id"):
        argv.append(str(p["ocr_run_id"]))
        if p.get("seg_run_id"):
            argv.append(str(p["seg_run_id"]))
    return argv


# Kinds this worker runs itself. mirror_annotation, sync_allmaps and warp are
# not here: they need the service key, so the server runs them (see execute()).
RUNNERS = {"ocr": ocr_argv, "seg": seg_argv, "join": join_argv, "layout": layout_argv,
           "tile_to_r2": tile_argv}
SERVER_KINDS = {"mirror_annotation", "sync_allmaps", "warp"}


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


def _self_check() -> None:
    """
    Run: python work/worker/vma_worker.py --self-check

    Guards ROADMAP 5c. Patches claim() rather than the network, so this needs
    no worker key, no server and no database.
    """
    import contextlib
    import io

    mod = sys.modules[__name__]
    original_claim, original_argv = mod.claim, sys.argv[:]

    def run(claim_impl, argv):
        mod.claim = claim_impl
        sys.argv = ["vma_worker.py", *argv]
        out, err, code = io.StringIO(), io.StringIO(), 0
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                main()
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else 1
        return code, out.getvalue(), err.getvalue()

    def unreachable(kinds, worker):
        raise requests.ConnectionError("Failed to resolve 'maparchive.vn'")

    try:
        # 1. The network is down. This must not look like success.
        code, out, err = run(unreachable, ["--once", "--kinds", "ocr"])
        assert code != 0, f"a claim that raises must exit non-zero, got {code}"
        assert "queue empty" not in out, "a transport error must not report an empty queue"
        assert "claim failed" in err, "the transport error must be reported on stderr"

        # 2. The API answered and had no job. That is success.
        code, out, err = run(lambda kinds, worker: None, ["--once", "--kinds", "ocr"])
        assert code == 0, f"an empty queue is success, got {code}"
        assert "queue empty" in out, "an empty queue must say so"

        # 3. The two outcomes must not be confusable on the exit code alone,
        #    which is the whole point: a drain loop reads exactly that.
        down, _, _ = run(unreachable, ["--once"])
        empty, _, _ = run(lambda kinds, worker: None, ["--once"])
        assert down != empty, "unreachable and empty must differ in exit code"
    finally:
        mod.claim, sys.argv = original_claim, original_argv

    print("[ok] vma_worker self-check passed")


def main() -> None:
    ap = argparse.ArgumentParser(description="Claim and run VMA pipeline jobs.")
    ap.add_argument(
        "--kinds",
        default="ocr,join,layout",
        help="comma-separated job kinds to claim: ocr, join, layout, tile_to_r2, mirror_annotation, sync_allmaps (default: ocr,join,layout)",
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
            # A transport error is not an empty queue. Conflating the two is how
            # ocr job 107182d6 sat stranded in `running` with a dead subprocess
            # while an unattended drain reported success (ROADMAP 5c). Under
            # --once the caller is a shell loop reading the exit code, so fail
            # there; when polling, keep going — a blip should not kill a worker
            # that is meant to run for hours.
            print(f"claim failed: {e}", file=sys.stderr)
            if args.once:
                sys.exit(1)
            time.sleep(args.interval)
            continue

        if job:
            run_job(job, args.python)
            if args.once:
                return
        elif args.once:
            # Reached only when the API answered and had nothing to give.
            print("queue empty")
            return
        else:
            time.sleep(args.interval)


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
        sys.exit(0)
    try:
        main()
    except KeyboardInterrupt:
        print("\nstopped")
