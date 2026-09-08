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
import shutil
import subprocess
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]

# Ceiling on one step of a job. The slowest legitimate step is the 1200px OCR
# pass, about 30 minutes on a dense sheet; two hours leaves room for rate-limit
# backoff without letting a wedged child hold a worker for a day.
STEP_TIMEOUT_S = int(os.environ.get("VMA_STEP_TIMEOUT_S", str(2 * 60 * 60)))

# The job this worker holds, so a Ctrl-C can hand it back instead of stranding
# it. At most one: the loop runs a single job at a time.
_IN_FLIGHT: list[str] = []
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
    """Report a job's outcome, retrying a transport failure a few times.

    This runs at the end of a batch that may have taken 45 minutes, and it used
    to be a bare _post: one 502 from the edge raised straight out of run_job,
    past the main loop's try (which wraps claim only), and killed the worker —
    leaving the row in 'running' with the extractions already written. That is
    the same stranded state migration 077's reclaim now clears after three
    hours, but three hours late. Four tries over ~15s covers a redeploy.
    """
    body = {"job_id": job_id, "status": status, "result": result or {}, "error": err}
    for attempt in range(4):
        try:
            _post("/api/pipeline/results", body)
            return
        except requests.RequestException as e:
            if attempt == 3:
                print(f"could not report job {job_id} as {status}: {e}", file=sys.stderr)
                return
            time.sleep(2 ** attempt)


def ocr_argv(job: dict, python_bin: str) -> list[str] | list[list[str]]:
    """Turn an `ocr` job payload into the ocr.py batch command line.

    `passes: 2` returns a plan instead: the batch on the grid, the same batch
    with the grid moved half a tile, and `merge --db` to vote them into the
    payload's run_id. `passes: 3` adds a 1200 px pass for small type first. Measured 2026-09-08 on the 1882 sheet: 39/43
    for one pass, 41/43 for two — see work/ocr/EVAL-BASELINE.md.
    """
    p = job["payload"]
    # Default two, not one: the grid plus the half-tile-shifted grid, voted. It
    # read 41/43 against 39/43 for a single pass on the 1882 sheet, and both
    # enqueue paths asked for 2 explicitly — so a `1` here only ever meant "this
    # job row predates the recipe", never "single pass was chosen".
    if int(p.get("passes", 2)) >= 2:
        return _two_pass_plan(job, python_bin)
    return _ocr_batch_argv(job, python_bin, p["run_id"], db=True)


# The hi-res pass's own grid. Named because `passes: 3` is only meaningful when
# the run's tile_size is coarser than this.
HIRES_TILE = 1200
HIRES_OVERLAP = 150

# The render the model actually sees, when a job does not name one.
#
# One rule, one place. Before this the flat default lived here at 1024 while
# enqueue_ocr_all.mjs computed max(tile, 1024) and sent it, so the same sheet was
# read at 1:1 by the fleet script and at a 2.34x downsample by the Run OCR
# button — and every number in EVAL-BASELINE was measured at the button's
# setting. Equal to the tile is 1:1, the source ceiling; anything above only
# upsamples. The 1024 floor is there because a very small image is not what
# these prompts expect.
RENDER_FLOOR = 1024


def _render_size(payload: dict) -> int:
    return max(int(payload.get("tile_size", 2400)), RENDER_FLOOR)


def _default_prompt() -> str | None:
    """The prompt id `ocr.py` would pick, resolved here so the job records it.

    Neither enqueue path sent a `prompt`, so every queued run silently inherited
    whatever `DEFAULT_PROMPT` the worker's checkout happened to have — and with
    the two-pass recipe the passes run with --db off, so the prompt was written
    down nowhere at all. Naming it in a third place (the route, the fleet script)
    would just be three constants to drift; reading the one declaration and
    stamping it into the argv means the run's rows say what they used.

    Returns None if the OCR venv is not importable, which leaves the previous
    behaviour rather than failing the job.
    """
    try:
        sys.path.insert(0, str(REPO_ROOT / "work" / "ocr" / "scripts"))
        from prompt import DEFAULT_PROMPT  # type: ignore[import-not-found]

        return str(DEFAULT_PROMPT)
    except Exception:
        return None


def _two_pass_plan(job: dict, python_bin: str) -> list[list[str]]:
    p = job["payload"]
    run, tile = p["run_id"], int(p.get("tile_size", 2400))
    a = _ocr_batch_argv(job, python_bin, f"{run}-a", db=False)
    b = _ocr_batch_argv(job, python_bin, f"{run}-b", db=False) + ["--grid-offset", str(tile // 2)]
    passes = [a, b]
    if int(p.get("passes", 2)) >= 3:
        # A near-1:1 pass for small type. It read POSTE DE POLICE and MESSAGERIES
        # MARITIMES, which no 2400 px pass ever returned — and fragments the long
        # labels the 2400 passes read whole, so it only ever rides along, never
        # alone. Twice the tokens of the other two together, ~30 min more.
        #
        # Only when it is actually finer than the grid passes. enqueue_ocr_all
        # normalises tile_size to ground metres, so on a coarse sheet it may
        # already have chosen 1200 or less — and then this pass is a byte-for-byte
        # copy of pass a. That costs nothing in tokens (the tile cache answers it)
        # but it poisons the vote: the merge would see three voters where two
        # agree only because they are the same pass, inflating `n_passes` and
        # turning the three-voter tie-break back into the two-voter one that
        # dropped diacritic_recall to 0.864.
        if tile > HIRES_TILE:
            hires = _ocr_batch_argv(job, python_bin, f"{run}-c", db=False)
            for flag, val in (("--tile-size", str(HIRES_TILE)), ("--overlap", str(HIRES_OVERLAP))):
                hires[hires.index(flag) + 1] = val
            passes.append(hires)
        else:
            print(f"[ocr] passes:3 ignored — tile_size {tile} is already at or below "
                  f"the {HIRES_TILE}px hi-res pass, which would duplicate pass a")
    runs = ",".join(cmd[cmd.index("--run-id") + 1] for cmd in passes)
    merge = [python_bin, str(OCR_SCRIPT), "merge", "--map-id", job["map_id"],
             "--runs", runs, "--run-id", run, "--tile-size", str(tile), "--db"]
    return [*passes, merge]


def _ocr_batch_argv(job: dict, python_bin: str, run_id: str, db: bool) -> list[str]:
    p = job["payload"]
    argv = [
        python_bin,
        str(OCR_SCRIPT),
        "batch",
        "--map-id", job["map_id"],
        "--run-id", run_id,
        "--tile-size", str(p.get("tile_size", 2400)),
        "--overlap", str(p.get("overlap", 600)),
        # The one that decides whether a street name is legible. Each tile is
        # `tile_size` source pixels rendered down to `render_size` before the
        # model sees it, so the effective ground resolution is the sheet's
        # own m/px times tile_size/render_size. The defaults are 2400/1024 —
        # a 2.34x downsample on top of the scan, which put the 1959 Saigon
        # sheet in front of Gemini at ~6.5 m/px. Equal values are 1:1, the
        # source ceiling; larger only upsamples and buys nothing.
        "--render-size", str(p.get("render_size") or _render_size(p)),
        "--concurrency", str(p.get("concurrency", 3)),
        "--min-confidence", str(p.get("min_confidence", 0.5)),
    ]
    if db:
        argv.append("--db")
    # Left unset, every queued job silently inherits gemini_client.DEFAULT_MODEL,
    # which is invisible from the job row. Passing it explicitly means the run's
    # calls.jsonl and the payload agree about what was used.
    if p.get("model"):
        argv += ["--model", str(p["model"])]
    # Same reasoning as --model: unset, every job silently ran DEFAULT_PROMPT,
    # whatever that was on the day the worker started, and the rows never said.
    prompt_id = p.get("prompt") or _default_prompt()
    if prompt_id:
        argv += ["--prompt", str(prompt_id)]
    # Opt-in: blank water and margin tiles cost the same as dense ones.
    if p.get("skip_sparse"):
        argv.append("--skip-sparse")
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
    runs on a machine set up for it — the default kinds include it only when
    both tools are on PATH (see default_kinds()).
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


def default_kinds() -> str:
    """Every kind this machine can run, so a worker left running finishes what
    publishing enqueues (mirror_annotation, tile_to_r2 — mig 058) instead of
    leaving those rows queued until someone remembers `--kinds`. `seg` stays
    opt-in: it wants a GPU. `tile_to_r2` needs vips + rclone on PATH."""
    kinds = ["ocr", "join", "layout", *sorted(SERVER_KINDS)]
    if shutil.which("vips") and shutil.which("rclone"):
        kinds.append("tile_to_r2")
    return ",".join(kinds)


def run_job(job: dict, python_bin: str) -> None:
    _IN_FLIGHT[:] = [job["id"]]
    try:
        _run_job(job, python_bin)
    finally:
        _IN_FLIGHT.clear()


def _run_job(job: dict, python_bin: str) -> None:
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

    # A runner returns one command, or a plan of several run in order (the
    # two-pass OCR recipe). The first non-zero exit fails the job.
    plan: list[list[str]] = argv if argv and isinstance(argv[0], list) else [argv]  # type: ignore[list-item]
    finish(job["id"], "running")

    # The pipeline scripts write through the same endpoint with the same key.
    api_url, api_key = _config()
    env = {**os.environ, "VMA_API_URL": api_url, "VMA_WORKER_KEY": api_key}

    proc = None
    for step, cmd in enumerate(plan, 1):
        print(f"[{kind}] {job['id']} running {step}/{len(plan)}: {' '.join(cmd)}")
        try:
            proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, env=env,
                                  timeout=STEP_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            # Without this the worker blocked forever on a wedged child and the
            # job sat in 'running' with nobody able to queue that map again.
            # Generous on purpose: the slowest legitimate step is the 1200px
            # pass at about 30 minutes.
            finish(job["id"], "failed",
                   err=f"step {step}/{len(plan)} exceeded {STEP_TIMEOUT_S}s and was killed")
            print(f"[{kind}] {job['id']} TIMED OUT on step {step}/{len(plan)}")
            return
        except OSError as e:
            # A missing interpreter or script would otherwise leave the job stuck in
            # 'running' with nobody to claim it again.
            finish(job["id"], "failed", err=str(e))
            print(f"[{kind}] {job['id']} FAILED to start: {e}")
            return
        if proc.returncode != 0:
            break

    assert proc is not None
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

    # 4. The render the model sees. One rule, here, so the Run OCR button and
    #    enqueue_ocr_all cannot disagree about it again.
    assert _render_size({"tile_size": 2400}) == 2400, "equal to the tile is 1:1"
    assert _render_size({"tile_size": 800}) == RENDER_FLOOR, "a small tile still gets the floor"
    assert _render_size({}) == 2400, "the default tile renders 1:1"

    # 5. `passes: 3` must not append a pass identical to pass a. On a sheet whose
    #    tile_size is already at or below the hi-res grid it would be a copy, and
    #    the merge would count it as an independent voter.
    def plan_for(tile, passes):
        job = {"id": "j", "map_id": "m", "payload": {"run_id": "r", "tile_size": tile,
                                                     "passes": passes}}
        return _two_pass_plan(job, "python")

    assert len(plan_for(2400, 3)) == 4, "coarse sheet: two grid passes, hi-res, merge"
    assert len(plan_for(1200, 3)) == 3, "tile already 1200: hi-res would duplicate pass a"
    assert len(plan_for(900, 3)) == 3, "tile finer than the hi-res grid: likewise"
    assert len(plan_for(2400, 2)) == 3, "two passes plus the merge"
    # The merge must name every pass it is given, and write to the payload's run.
    plan = plan_for(2400, 3)
    merge = plan[-1]
    assert merge[merge.index("--runs") + 1] == "r-a,r-b,r-c", merge
    assert merge[merge.index("--run-id") + 1] == "r", "the merge owns the payload's run_id"
    assert "--db" in merge and not any("--db" in step for step in plan[:-1]), \
        "only the merge writes to the database"

    # 6. The prompt is stamped from its one declaration, so the rows say what
    #    they used instead of inheriting whatever the checkout had.
    argv = _ocr_batch_argv({"id": "j", "map_id": "m", "payload": {"run_id": "r"}}, "python",
                           "r", db=False)
    assert "--prompt" in argv, "a queued run must name its prompt"
    argv = _ocr_batch_argv({"id": "j", "map_id": "m",
                            "payload": {"run_id": "r", "prompt": "v8"}}, "python", "r", db=False)
    assert argv[argv.index("--prompt") + 1] == "v8", "an explicit prompt wins"

    print("[ok] vma_worker self-check passed")


def main() -> None:
    ap = argparse.ArgumentParser(description="Claim and run VMA pipeline jobs.")
    ap.add_argument(
        "--kinds",
        default=default_kinds(),
        help=f"comma-separated job kinds to claim; seg is opt-in, tile_to_r2 needs vips + rclone (default here: {default_kinds()})",
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
            try:
                run_job(job, args.python)
            except Exception as e:  # noqa: BLE001 — a worker meant to run for hours
                # Anything unhandled here would otherwise end the process and
                # leave the row in 'running'. Report it, keep polling.
                print(f"job {job.get('id')} raised: {e}", file=sys.stderr)
                finish(job["id"], "failed", err=f"worker error: {e}"[:2000])
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
        # A job in flight is reported failed so finish_job requeues it (attempts
        # permitting). Ctrl-C is the documented way to stop a worker, and it used
        # to strand whatever was running.
        if _IN_FLIGHT:
            print(f"\nstopped — handing job {_IN_FLIGHT[0]} back to the queue")
            finish(_IN_FLIGHT[0], "failed", err="worker interrupted")
        else:
            print("\nstopped")
