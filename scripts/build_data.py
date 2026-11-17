#!/usr/bin/env python3
"""Build a read-only, validated Cardmarket Pokémon data relay for Keep & Flip.
No personal Keep & Flip information is read, stored, or uploaded.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
import urllib.request
import time
import hashlib
import math

BASE = 'https://downloads.s3.cardmarket.com/productCatalog/'
SOURCE = {
    'singles': BASE+'productList/products_singles_6.json',
    'sealed': BASE+'productList/products_nonsingles_6.json',
    'prices': BASE+'priceGuide/price_guide_6.json',
}


def download(url: str):
    err = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'KeepFlip-Catalog-Sync/1.0', 'Accept':'application/json'})
            with urllib.request.urlopen(req, timeout=75) as res:
                limit = 55 * 1024 * 1024
                data = res.read(limit + 1)
                if len(data) > limit:
                    raise ValueError('Official source exceeds 55 MB')
                return json.loads(data.decode('utf-8'))
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            err = exc
            if attempt < 2: time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'Cannot download {url}: {err}')


def validated(kind, data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValueError(f'{kind}: not Cardmarket version 1')
    raw = data.get('priceGuides' if kind == 'prices' else 'products')
    if not isinstance(raw, list) or not (1 <= len(raw) <= 350000):
        raise ValueError(f'{kind}: invalid row count')
    if not isinstance(data.get('createdAt'), str) or not data['createdAt'][:10].count('-') == 2:
        raise ValueError(f'{kind}: missing source date')
    if not all(isinstance(row, dict) and isinstance(row.get('idProduct'), int) and row['idProduct'] > 0 for row in raw):
        raise ValueError(f'{kind}: invalid product IDs')
    # Reject obviously invalid guides before any GitHub Pages deployment.
    if kind == 'prices':
        for row in raw:
            for field in ('avg', 'low', 'trend', 'avg1', 'avg7', 'avg30',
                          'avg-holo', 'low-holo', 'trend-holo', 'avg1-holo',
                          'avg7-holo', 'avg30-holo'):
                value = row.get(field)
                if value is not None and (isinstance(value, bool) or
                    not isinstance(value, (int, float)) or
                    not math.isfinite(value) or value < 0):
                    raise ValueError(f'prices: invalid numeric field {field}')
    return raw


def slim(kind, raw, date):
    if kind == 'prices':
        fields = ('idProduct', 'idCategory', 'avg', 'low', 'trend', 'avg1', 'avg7', 'avg30',
                  'avg-holo', 'low-holo', 'trend-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo')
        records = [{key: r.get(key) for key in fields if r.get(key) is not None} for r in raw]
        return {'version': 1, 'createdAt': date, 'priceGuides': records}
    fields = ('idProduct', 'name', 'idCategory', 'categoryName', 'idExpansion',
              'idMetacard', 'number', 'variant', 'expansionName', 'rarity', 'imageUrl')
    records = [{key: r.get(key) for key in fields if r.get(key) is not None} for r in raw]
    return {'version':1, 'createdAt':date, 'products':records}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.json.tmp')
    with temp.open('w', encoding='utf-8') as out:
        json.dump(data, out, ensure_ascii=False, separators=(',', ':'))
    temp.replace(path)


def build(outdir: Path, cache_dir: Path, source_dir: Path | None, refresh_catalog: bool):
    outdir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    manifest = {'schema':'keepflip-cardmarket-v1',
                'generatedAt':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
                'sources':{}}
    for kind in ('singles','sealed','prices'):
        cache_file = cache_dir / (kind+'.json')
        if source_dir:
            filename = {'singles':'products_singles_6.json','sealed':'products_nonsingles_6.json','prices':'price_guide_6.json'}[kind]
            raw_data = json.loads((source_dir/filename).read_text(encoding='utf-8'))
        elif kind != 'prices' and cache_file.is_file() and not refresh_catalog:
            raw_data = json.loads(cache_file.read_text(encoding='utf-8'))
        else:
            raw_data = download(SOURCE[kind])
            if kind != 'prices': write_json(cache_file, raw_data)
        rows = validated(kind, raw_data)
        if kind == 'prices':
            # Keep the previously published Pages deployment intact if the
            # official daily feed unexpectedly loses most rows.
            if cache_file.exists() and not source_dir:
                try:
                    previous = validated('prices', json.loads(cache_file.read_text(encoding='utf-8')))
                    if len(previous) >= 1000 and len(rows) < len(previous) * 0.75:
                        raise ValueError(f'prices: source shrank from {len(previous)} to {len(rows)} rows')
                except json.JSONDecodeError:
                    pass
            # Price cache is updated only AFTER the entire build passes
            # freshness and publication validation below.
        obj = slim(kind, rows, raw_data['createdAt'])
        filename = kind+'.json'
        write_json(outdir/filename, obj)
        manifest['sources'][kind] = {'file':filename,'createdAt':raw_data['createdAt'],
                                     'count':len(rows),'officialUrl':SOURCE[kind],
                                     'sha256':sha256(outdir/filename),
                                     'bytes':(outdir/filename).stat().st_size}
        print(f"{kind}: {len(rows):,} records; source {raw_data['createdAt']}; "
              f"output {(outdir/filename).stat().st_size/1048576:.1f} MiB")
    # An unexpectedly old price guide is a FAILED update. The old published
    # GitHub Pages deployment stays online; never overwrite it with stale data.
    if not source_dir:
        price_date = dt.datetime.fromisoformat(
            str(manifest['sources']['prices']['createdAt']).replace('Z','+00:00')
        )
        if price_date.tzinfo is None:
            price_date = price_date.replace(tzinfo=dt.timezone.utc)
        age = dt.datetime.now(dt.timezone.utc)-price_date.astimezone(dt.timezone.utc)
        if age > dt.timedelta(days=5) or age < dt.timedelta(days=-1):
            raise ValueError(f'prices: official source date outside safe freshness window ({age})')
    if not source_dir:
        write_json(cache_dir/'prices.json', raw_data)
    manifest['checks']={'pricesValidated':True,'sourceDatesValidated':True}
    write_json(outdir/'manifest.json', manifest)
    return manifest


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', type=Path, default=Path('site/data'))
    p.add_argument('--cache', type=Path, default=Path('.cache/cardmarket'))
    p.add_argument('--source-dir', type=Path, default=None, help='Offline test: use existing downloaded files')
    p.add_argument('--refresh-catalog', action='store_true')
    args = p.parse_args()
    refresh = args.refresh_catalog or dt.datetime.now(dt.timezone.utc).weekday() == 4
    build(args.out, args.cache, args.source_dir, refresh)

if __name__ == '__main__':
    main()
