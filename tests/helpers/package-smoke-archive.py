"""Fixed private archive fixture writer; payload bytes are data, never code."""
import gzip
import io
import json
import os
import sys
import tarfile
import time

payload = json.loads(sys.stdin.read())
root = os.path.dirname(payload["archive"])
progress_fd = os.open(os.path.join(root, "writer-progress.json"),
                      os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
started = time.monotonic()


def checkpoint(stage):
    data = json.dumps({"scope": "archive-fixture-diagnostic-only", "stage": stage,
                       "pythonVersion": sys.version.split()[0], "pythonExecutable": sys.executable,
                       "elapsedMs": round((time.monotonic() - started) * 1000),
                       "benchmarkEligible": False, "descendantQuiescenceVerified": False}).encode()
    os.pwrite(progress_fd, data, 0)
    os.ftruncate(progress_fd, len(data))


try:
    checkpoint("payload-read")
    scenario = payload.get("writerScenario", "normal")
    if scenario == "stall":
        checkpoint("fixed-stall")
        time.sleep(15)
    elif scenario == "nonzero":
        checkpoint("fixed-refusal")
        raise RuntimeError("private fixture writer error")
    elif scenario != "normal":
        raise ValueError("unsupported writer fixture scenario")
    checkpoint("archive-write-start")
    if payload["bomb"]:
        with gzip.open(payload["archive"], "wb") as stream:
            for _ in range(129):
                stream.write(bytes(1024 * 1024))
    else:
        with tarfile.open(payload["archive"], "w:gz") as archive:
            for item in payload["files"]:
                data = item.get("content", "").encode()
                info = tarfile.TarInfo(item["name"])
                info.mode = 0o644
                info.size = item.get("size", len(data))
                if item.get("type") == "symlink":
                    info.type, info.linkname, info.size = tarfile.SYMTYPE, "../outside", 0
                if item.get("type") == "hardlink":
                    info.type, info.linkname, info.size = tarfile.LNKTYPE, "package/index.mjs", 0
                if item.get("type") == "device":
                    info.type, info.size = tarfile.CHRTYPE, 0
                archive.addfile(info, io.BytesIO(data) if info.size == len(data) else None)
    checkpoint("archive-write-complete")
finally:
    os.close(progress_fd)
