#!/usr/bin/env python3
"""Build a conservative photo/identity quality audit for Keep & Flip 2.21.12 TEST.

This scans public regression examples, NOT a user's personal card collection.
Only a successfully fetched TCGdex asset is called an available image. A photo
of a card is not proof of its exact printing, edition, grade, or market price.
A candidate Cardmarket ID must independently pass the official name check.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

OFFICIAL = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json"
LANGUAGES = ("en", "ja", "ko", "zh-cn", "zh-tw")
RAW_GITHUB = "https://raw.githubusercontent.com/GregNcheese/keepflip-cardmarket-sync/test/quality-images-22112/test-data/universal-2219/"
MAX_JSON = 55 * 1024 * 1024


def download_json(url: str):
    request = Request(url, headers={"User-Agent": "KeepFlip-Quality-Audit/2.21.12", "Accept": "application/json"})
    with urlopen(request, timeout=60) as response:
        data = response.read(MAX_JSON + 1)
    if len(data) > MAX_JSON:
        raise ValueError("JSON size limit exceeded")
    return json.loads(data)


def canonical_name(name: object) -> str:
    value = str(name or "").split("[", 1)[0].strip()
    value = unicodedata.normalize("NFKD", value).casefold()
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in value if not unicodedata.combining(c)))


def valid_asset_base(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parts = urlsplit(value)
    return (parts.scheme == "https" and parts.hostname == "assets.tcgdex.net"
            and not parts.query and not parts.fragment and not parts.username and not parts.password
            and bool(re.fullmatch(r"/[A-Za-z0-9_+%./-]{5,250}", parts.path))
            and ".." not in parts.path)


def verified_image(base: object, probe=None) -> dict:
    if not valid_asset_base(base):
        return {"status": "no-asset-url", "url": None}
    url = base.rstrip("/") + "/low.webp"
    if probe is None:
        probe = probe_webp
    try:
        ok = bool(probe(url))
    except (OSError, ValueError, RuntimeError):
        ok = False
    return {"status": "asset-verified" if ok else "asset-unavailable",
            "url": url if ok else None}


def probe_webp(url: str) -> bool:
    """Read a few bytes: an HTTP 200 alone is not proof of a working image."""
    request = Request(url, headers={"User-Agent": "KeepFlip-Quality-Audit/2.21.12",
                                    "Accept": "image/webp",
                                    "Range": "bytes=0-31"})
    try:
        with urlopen(request, timeout=12) as response:
            start = response.read(16)
            mime = str(response.headers.get("Content-Type", "")).split(";", 1)[0].strip().lower()
            return mime == "image/webp" and start[:4] == b"RIFF" and start[8:12] == b"WEBP"
    except (HTTPError, URLError, OSError, TimeoutError):
        return False


def candidate_ids(card: dict) -> list[int]:
    variants = [card] + [x for x in card.get("variants_detailed", []) if isinstance(x, dict)]
    values = []
    for variant in variants:
        third = variant.get("thirdParty") or {}
        raw = third.get("cardmarket") if isinstance(third, dict) else None
        if isinstance(raw, int) and raw > 0:
            values.append(raw)
    return sorted(set(values))


def check_watchlist_card(entry: dict, official_products: dict, fetch=download_json, probe=None) -> dict:
    label, lang, tcgid = entry["label"], entry["language"], entry["tcgdexId"]
    result = {
        "label": label, "language": lang, "tcgdexId": tcgid,
        "expectedName": entry["expectedName"], "variant": entry.get("variant", ""),
        "image": {"status": "not-checked", "url": None},
        "product": {"status": "not-checked", "id": None},
        "canAutoPrice": False, "source": "TCGdex API + Cardmarket official singles",
    }
    if lang not in LANGUAGES or not re.fullmatch(r"[\w+.-]{1,80}", tcgid):
        result["image"]["status"] = "invalid-request"
        result["product"]["status"] = "invalid-request"
        return result
    try:
        detail = fetch("https://api.tcgdex.net/v2/" + lang + "/cards/" + quote(tcgid, safe=""))
    except (HTTPError, URLError, OSError, TimeoutError, RuntimeError, ValueError, KeyError):
        detail = None
    if not isinstance(detail, dict) or str(detail.get("id", "")).casefold() != tcgid.casefold():
        result["image"]["status"] = "tcgdex-card-missing"
        result["product"]["status"] = "tcgdex-card-missing"
        # If an official catalog candidate exists, it may still be checked
        # independently below, but this cannot produce a verified card photo.
    else:
        result["image"] = verified_image(detail.get("image"), probe)
        result["tcgdexLocalId"] = detail.get("localId")
        result["tcgdexSetId"] = (detail.get("set") or {}).get("id")
        result["tcgdexName"] = detail.get("name")

    chosen = entry.get("cardmarketCandidateId")
    discovered = candidate_ids(detail) if isinstance(detail, dict) else []
    result["tcgdexCardmarketIds"] = discovered
    if chosen is None and len(discovered) == 1:
        chosen = discovered[0]
    if not isinstance(chosen, int) or chosen <= 0:
        result["product"]["status"] = "missing-id"
        return result

    found = official_products.get(chosen)
    result["product"]["id"] = chosen
    if not isinstance(found, dict):
        result["product"]["status"] = "id-not-in-official-catalog"
        return result
    official_name = found.get("name")
    result["product"]["officialName"] = official_name
    result["product"]["expansionId"] = found.get("idExpansion")
    if canonical_name(official_name) != canonical_name(entry["expectedName"]):
        result["product"]["status"] = "name-conflict"
        result["product"]["reason"] = "Official Cardmarket product name differs; do not price or use photo as print proof"
        return result

    if discovered and chosen not in discovered:
        result["product"]["status"] = "source-id-conflict"
        return result
    if len(discovered) > 1:
        result["product"]["status"] = "multiple-printings"
        return result
    if entry.get("variant") or result["image"]["status"] != "asset-verified":
        result["product"]["status"] = "variant-or-image-review"
    else:
        # Matching Cardmarket name and TCGdex identity are good candidates,
        # but an independent expansion/printing check is still outstanding.
        result["product"]["status"] = "name-matched-review"
    return result


def coverage_report(all_indexes: dict[str, dict]) -> dict:
    languages = {}
    for lang, index in all_indexes.items():
        sets = index.get("sets", [])
        cards = index.get("cards", [])
        if index.get("schema") != "keepflip-universal-cards-v1":
            raise ValueError("Unexpected universal index schema for " + lang)
        if not isinstance(sets, list) or not isinstance(cards, list):
            raise ValueError("Invalid universal set/card lists")
        counts = {s[0]: {"id": s[0], "name": s[1], "cards": 0, "withImageUrl": 0} for s in sets}
        missing_images = 0
        for c in cards:
            if not isinstance(c, list) or len(c) < 5:
                continue
            if c[1] in counts:
                counts[c[1]]["cards"] += 1
                if valid_asset_base(c[4]):
                    counts[c[1]]["withImageUrl"] += 1
                else:
                    missing_images += 1
        empty = [v for v in counts.values() if v["cards"] == 0]
        empty.sort(key=lambda row: row["name"])
        languages[lang] = {
            "cards": len(cards),
            "sets": len(sets),
            "cardsWithoutImageUrl": missing_images,
            "setsWithoutCards": len(empty),
            "emptySets": empty,
            "description": "An absent TCGdex listing is a coverage gap, not proof the card/set does not exist",
        }
    return {"schema": "keepflip-quality-coverage-v1", "languages": languages}


def build(root: Path, out: Path, watches: Path, get=download_json, probe=None) -> dict:
    spec = json.loads(watches.read_text(encoding="utf-8"))
    if spec.get("schema") != "keepflip-quality-watchlist-v1":
        raise ValueError("Unexpected watchlist schema")
    official = get(OFFICIAL)
    if official.get("version") != 1 or not isinstance(official.get("products"), list):
        raise ValueError("Invalid official Cardmarket singles data")
    official_products = {
        obj["idProduct"]: obj for obj in official["products"]
        if isinstance(obj, dict) and isinstance(obj.get("idProduct"), int) and obj["idProduct"] > 0
    }
    if len(official_products) < 50000:
        raise ValueError("Insufficient Cardmarket products; refuse to publish audit")

    indexes = {}
    for lang in LANGUAGES:
        path = root / ("universal-" + lang + ".json")
        indexes[lang] = json.loads(path.read_text(encoding="utf-8"))
    coverage = coverage_report(indexes)
    results = [check_watchlist_card(w, official_products, get, probe) for w in spec["cards"]]
    audit = {
        "schema": "keepflip-quality-audit-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "officialCatalogCreatedAt": official.get("createdAt"),
        "notes": "Public regression cases only. No personal inventory. Image verification does not verify printing, edition, or market price.",
        "results": results,
        "summary": {
            "cardsChecked": len(results),
            "imagesVerified": sum(r["image"]["status"] == "asset-verified" for r in results),
            "idConflicts": sum(r["product"]["status"] in {"name-conflict", "source-id-conflict"} for r in results),
            "autoPricesWritten": 0,
        },
    }
    out.mkdir(parents=True, exist_ok=True)
    for name, doc in (("quality-audit.json", audit), ("coverage-report.json", coverage)):
        path = out / name
        temp = out / (name + ".tmp")
        temp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temp.replace(path)
    return audit


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("test-data/universal-2219"))
    parser.add_argument("--out", type=Path, default=Path("test-data/quality-22112"))
    parser.add_argument("--watchlist", type=Path, default=Path("config/quality_watchlist.json"))
    a = parser.parse_args()
    r = build(a.root, a.out, a.watchlist)
    for row in r["results"]:
        print(row["label"], "IMAGE", row["image"]["status"], "PRODUCT", row["product"]["status"], row["product"]["id"])
    print("SUMMARY", r["summary"])
