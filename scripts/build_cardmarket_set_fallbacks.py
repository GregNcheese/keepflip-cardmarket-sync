#!/usr/bin/env python3
"""Build optional, review-only Cardmarket expansion fallback from official singles.

Use a manually verified product ID as an *expansion anchor*, not as a
per-card hardcode. Every output ID comes from Cardmarket's official export.
Unverified expansion IDs, names or anchors cause a hard failure.

Only intended for sparse/missing TCGdex sets. This is a discovery aid, not
proof of collector numbers, language, first edition or finish.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import unicodedata
from urllib.request import Request, urlopen

SOURCE = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json"
SCHEMA = "keepflip-cardmarket-set-fallback-v1"


def normal(name):
    text = str(name or "").split("[", 1)[0].strip()
    text = unicodedata.normalize("NFKD", text).casefold()
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in text if not unicodedata.combining(c)))


def build_from_data(config: dict, official: dict, generated_at: str) -> dict:
    if config.get("schema") != "keepflip-cardmarket-set-anchors-v1":
        raise ValueError("Invalid anchor schema")
    if official.get("version") != 1 or not isinstance(official.get("products"), list):
        raise ValueError("Invalid official Cardmarket products JSON")
    products = official["products"]
    if not (50000 <= len(products) <= 350000):
        raise ValueError("Unexpected official Pokémon singles row count")
    ids = {p.get("idProduct"): p for p in products if isinstance(p, dict)}
    result = []
    for a in config.get("sets", []):
        anchor_id = a.get("anchorProductId")
        anchor = ids.get(anchor_id)
        if not anchor or normal(anchor.get("name")) != normal(a.get("anchorName")):
            raise ValueError(f"Anchor {anchor_id} is missing or has the wrong official name")
        expansion_id = anchor.get("idExpansion")
        if not isinstance(expansion_id, int) or expansion_id <= 0:
            raise ValueError(f"Anchor {anchor_id} lacks a valid Cardmarket expansion ID")
        matches = []
        for p in products:
            if not isinstance(p, dict) or p.get("idExpansion") != expansion_id:
                continue
            pid, name = p.get("idProduct"), p.get("name")
            if isinstance(pid, int) and pid > 0 and isinstance(name, str) and name.strip():
                matches.append([pid, name.strip()])
        if not 10 <= len(matches) <= 500:
            raise ValueError(f"Unexpected expansion size {len(matches)} for {a.get('setName')}")
        matches.sort(key=lambda row: (normal(row[1]), row[0]))
        result.append({
            "setId": a["setId"], "setSlug": a["setSlug"],
            "setName": a["setName"], "language": a["language"],
            "cardmarketExpansionId": expansion_id,
            "verifiedAnchorProductId": anchor_id,
            "products": matches,
            "count": len(matches),
            "source": "Official Cardmarket Pokémon singles catalog",
        })
    return {
        "schema": SCHEMA,
        "generatedAt": generated_at,
        "catalogCreatedAt": official.get("createdAt"),
        "note": "Review-only: does not prove card number, print, variant, image or language.",
        "sets": result,
    }


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--anchors",type=Path,default=Path("config/cardmarket_set_anchors.json"))
    parser.add_argument("--official-file",type=Path)
    parser.add_argument("--out",type=Path,default=Path("test-data/universal-2219/cardmarket-set-fallbacks.json"))
    args=parser.parse_args()
    anchors=json.loads(args.anchors.read_text(encoding="utf-8"))
    if args.official_file:
        official=json.loads(args.official_file.read_text(encoding="utf-8"))
    else:
        request=Request(SOURCE,headers={"User-Agent":"KeepFlip-Test-SetFallback/2.21.11","Accept":"application/json"})
        with urlopen(request,timeout=85) as response:
            body=response.read(55*1024*1024+1)
        if len(body)>55*1024*1024: raise ValueError("Official catalogue too large")
        official=json.loads(body)
    obj=build_from_data(anchors,official,dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"))
    args.out.parent.mkdir(parents=True,exist_ok=True)
    tmp=args.out.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    tmp.replace(args.out)
    for s in obj["sets"]:
        print(f"{s['setName']}: {s['count']} official products; expansion ID {s['cardmarketExpansionId']}")
        for p in s["products"]:
            if normal(p[1])=="ninetales": print("  Ninetales:",p)


if __name__=="__main__":
    main()
