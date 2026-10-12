"""Downloads. Every source is written to its own folder under ``data/01_raw/<source>/`` with a
``manifest.json`` (URL, date, size, sha256), so a second run reuses it and a release can say exactly
which files it was built from. Downloaded files are data, never code: nothing here executes them.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path

import requests

log = logging.getLogger(__name__)

USER_AGENT = "3-30-300-data-processing/0.1"
HEADERS = {"User-Agent": USER_AGENT}


def now_utc() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def sha256(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def read_manifest(folder: Path) -> dict:
    p = folder / "manifest.json"
    return json.loads(p.read_text()) if p.exists() else {"files": {}}


def write_manifest(folder: Path, manifest: dict) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))


def fetch_file(
    url: str,
    folder: Path,
    name: str | None = None,
    retries: int = 4,
    allow_404: bool = False,
    timeout: int = 600,
) -> Path | None:
    """Download ``url`` into ``folder`` once (kept if the manifest lists it)."""
    folder.mkdir(parents=True, exist_ok=True)
    name = name or url.rsplit("/", 1)[-1]
    target = folder / name
    manifest = read_manifest(folder)
    entry = manifest["files"].get(name)
    if entry and target.exists() and target.stat().st_size == entry["bytes"]:
        return target
    if entry and entry.get("missing") and allow_404:
        return None
    for attempt in range(retries):
        try:
            with requests.get(url, headers=HEADERS, stream=True, timeout=timeout) as r:
                if r.status_code == 404 and allow_404:
                    manifest["files"][name] = {"url": url, "missing": True, "checked": now_utc()}
                    write_manifest(folder, manifest)
                    return None
                r.raise_for_status()
                tmp = target.with_suffix(target.suffix + ".part")
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                last_modified = r.headers.get("Last-Modified")
            tmp.replace(target)
            manifest["files"][name] = {
                "url": url,
                "downloaded": now_utc(),
                "last_modified": last_modified,
                "bytes": target.stat().st_size,
                "sha256": sha256(target),
            }
            write_manifest(folder, manifest)
            log.info("downloaded %s (%.1f MB)", name, target.stat().st_size / 1e6)
            return target
        except (requests.RequestException, OSError) as e:
            wait = 20 * 2**attempt
            log.warning("download of %s failed (%s), retrying in %ss", url, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"could not download {url}")
