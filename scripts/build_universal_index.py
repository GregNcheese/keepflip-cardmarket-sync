#!/usr/bin/env python3
"""Build Keep & Flip's five-language card discovery index from TCGdex.

Discovery != price verification. Bulk TCGdex lists contain card identity, not
reliably a Cardmarket product ID or exact print variant. Those must be checked
on demand against the official Cardmarket singles export.

No inventory, customer details, Cardmarket tokens or personal data are used.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LANGUAGES = {
    "en": "Engels",
    "ja": "Japans",
    "ko": "Koreaans",
    "zh-cn": "Chinees (vereenvoudigd)",
    "zh-tw": "Chinees (traditioneel)",
}
BASE = "https://api.tcgdex.net/v2"
SCHEMA = "keepflip-universal-cards-v1"
MANIFEST_SCHEMA = "keepflip-universal-index-v1"
MAX_DOWNLOAD = 45 * 1024 * 1024
ID_PATTERN = re.compile(r"^[\w+.-]{1,70}$", re.UNICODE)


def fetch_json(url: str):
    error = None
    for attempt in range(3):
        try:
            request = Request(url, headers={
                "User-Agent": "KeepFlip-Universal-Index/2.21.9",
                "Accept": "application/json",
            })
            with urlopen(request, timeout=70) as response:
                body = response.read(MAX_DOWNLOAD + 1)
            if len(body) > MAX_DOWNLOAD:
                raise ValueError("TCGdex response larger than 45 MiB")
            return json.loads(body)
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
            error = exc
            if attempt < 2:
                time.sleep(1 + attempt * 2)
    raise RuntimeError(f"TCGdex download failed: {url}: {error}")


def required_text(value, max_length: int = 300) -> str:
    if not isinstance(value, str):
        return ""
    s = value.strip()
    return s if 0 < len(s) <= max_length else ""


def make_language_index(lang: str, sets_raw, cards_raw, generated: str):
    if lang not in LANGUAGES:
        raise ValueError("Unknown language")
    if not isinstance(sets_raw, list) or not isinstance(cards_raw, list):
        raise ValueError("Unexpected TCGdex listing format")
    if len(sets_raw) > 10000 or len(cards_raw) > 250000:
        raise ValueError("Unexpectedly large TCGdex listing")

    sets = []
    ids = set()
    for s in sets_raw:
        if not isinstance(s, dict):
            continue
        sid = required_text(s.get("id"), 70)
        name = required_text(s.get("name"))
        if not sid or not name or not ID_PATTERN.fullmatch(sid) or sid in ids:
            continue
        ids.add(sid)
        sets.append([sid, name])
    # Keep all populated catalogues; do not pretend an empty Asian language is
    # complete. Missing cards remain missing instead of guessed translations.
    if not sets and cards_raw:
        raise ValueError("Cards returned without any sets")

    set_prefixes = sorted(ids, key=len, reverse=True)
    cards = []
    seen = set()
    for c in cards_raw:
        if not isinstance(c, dict):
            continue
        cid = required_text(c.get("id"), 100)
        local = required_text(str(c.get("localId", "")), 35)
        name = required_text(c.get("name"))
        if not cid or not local or not name or cid in seen:
            continue
        matched = next((sid for sid in set_prefixes if cid.startswith(sid + "-")), None)
        if not matched:
            # Orphan card: do not invent an expansion from its name.
            continue
        seen.add(cid)
        image = required_text(c.get("image"), 350)
        if image and not image.startswith("https://assets.tcgdex.net/"):
            image = ""
        # Compact field layout: [TCGdex id, set id, local id, localized name, image].
        cards.append([cid, matched, local, name, image])

    cards.sort(key=lambda c: (c[1], c[2], c[0]))
    sets.sort(key=lambda s: s[0])
    return {
        "schema": SCHEMA,
        "language": lang,
        "generatedAt": generated,
        "source": f"{BASE}/{lang}",
        "cardFields": ["id", "setId", "localId", "name", "image"],
        "setFields": ["id", "name"],
        "sets": sets,
        "cards": cards,
        "coverage": {
            "listedSets": len(sets_raw),
            "indexedSets": len(sets),
            "listedCards": len(cards_raw),
            "indexedCards": len(cards),
            "state": "available" if cards else "not-populated",
        },
    }


def build(out: Path, get=fetch_json):
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out.mkdir(parents=True, exist_ok=True)
    summary = {}
    for lang, label in LANGUAGES.items():
        sets = get(f"{BASE}/{lang}/sets")
        cards = get(f"{BASE}/{lang}/cards")
        doc = make_language_index(lang, sets, cards, timestamp)
        name = f"universal-{lang}.json"
        tmp = out / (name + ".tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(out / name)
        summary[lang] = {
            "label": label, "file": name,
            "cards": doc["coverage"]["indexedCards"],
            "sets": doc["coverage"]["indexedSets"],
            "state": doc["coverage"]["state"],
        }
        print(f"{lang}: {len(doc['cards']):,} cards in {len(doc['sets']):,} sets; "
              f"{(out/name).stat().st_size / 1024 / 1024:.2f} MiB")
    manifest = {
        "schema": MANIFEST_SCHEMA, "generatedAt": timestamp,
        "source": "TCGdex v2; card/print-to-Cardmarket matching still requires verification",
        "languages": summary,
    }
    path = out / "universal-manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("test-data/universal-2219"))
    args = parser.parse_args()
    build(args.out)


if __name__ == "__main__":
    main()
