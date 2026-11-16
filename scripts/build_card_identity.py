#!/usr/bin/env python3
"""Conservative, read-only Cardmarket identity index for Keep & Flip.

Reads the existing GitHub Pages singles + prices exports, then checks selected
Cardmarket URLs against *individual* TCGdex card records. Never infers a
Cardmarket product ID from card name or number alone.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

TCGDEX = 'https://api.tcgdex.net/v2'


def normalize(text: object) -> str:
    value = unicodedata.normalize('NFKD', str(text or '')).casefold()
    value = ''.join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r'\b(?:and|the)\b', '', value)
    return re.sub(r'[^a-z0-9]', '', value)


def same_number(a: object, b: object) -> bool:
    def local(x):
        x = str(x or '').split('/')[0].strip().upper()
        m = re.fullmatch(r'([A-Z]+)?0*(\d+)([A-Z]*)', x)
        return (m.group(1) or '', int(m.group(2)), m.group(3)) if m else (x,)
    return local(a) == local(b)


def link_is_single(url: str) -> bool:
    u = urlparse(url)
    return u.scheme == 'https' and u.hostname in {'cardmarket.com', 'www.cardmarket.com'} and '/Pokemon/Products/Singles/' in u.path


def get_json(url: str, timeout: int = 12, attempts: int = 2):
    last = None
    for tries in range(attempts):
        try:
            req = Request(url, headers={'User-Agent': 'KeepFlip-CardIdentity/1.0', 'Accept': 'application/json'})
            with urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            last = error
            if tries + 1 < attempts:
                time.sleep(1)
    raise RuntimeError(f'TCGdex request failed: {type(last).__name__}: {last}')


def cm_product_ids(card: dict) -> set[int]:
    def extract(v):
        if isinstance(v, int):
            return v if v > 0 else None
        if isinstance(v, str) and v.isdigit():
            return int(v) if int(v) > 0 else None
        if isinstance(v, dict):
            return extract(v.get('idProduct', v.get('id')))
        return None

    out = set()
    for obj in [card, *(card.get('variants_detailed') or [])]:
        if not isinstance(obj, dict):
            continue
        v = extract((obj.get('thirdParty') or {}).get('cardmarket'))
        if not v:
            v = extract(((obj.get('pricing') or {}).get('cardmarket') or {}).get('idProduct'))
        if v:
            out.add(v)
    return out


def find_card(target: dict, fetch=get_json) -> dict:
    language = target['language']
    set_id = target['tcgdexSetId']
    local = target['localNumber']
    # Don't guess a full ID when the set has legacy suffix or separate subset.
    endpoint = f'{TCGDEX}/{quote(language, safe="")}/sets/{quote(set_id, safe="")}'
    data = fetch(endpoint)
    if not isinstance(data, dict) or not isinstance(data.get('cards'), list):
        raise ValueError('TCGdex set response is incomplete')
    matches = [c for c in data['cards'] if same_number(c.get('localId'), local)]
    if len(matches) != 1:
        raise ValueError(f'Expected one local card in set, found {len(matches)}')
    card_id = matches[0]['id']
    card = fetch(f'{TCGDEX}/{quote(language, safe="")}/cards/{quote(card_id, safe="")}')
    if not isinstance(card, dict) or not same_number(card.get('localId'), local):
        raise ValueError('TCGdex card local number mismatch')
    if normalize((card.get('set') or {}).get('id')) != normalize(set_id):
        raise ValueError('TCGdex card belongs to a different set')
    return card


def catalog_name_matches(expected: str, official: str) -> bool:
    """Accept spelling/typography variants, not substring matches like GX vs EX."""
    official = re.sub(r'\s*\[[^\]]*\]\s*


def resolve(target: dict, products: dict[int, dict], prices: set[int], fetch=get_json) -> dict:
    url = target['url']
    base = {'label': target['label'], 'url': url, 'tcgdexSetId': target['tcgdexSetId'],
            'language': target['language'], 'localNumber': target['localNumber'],
            'variant': target.get('variant', ''), 'productId': None,
            'candidateIds': [], 'status': 'unavailable', 'reason': '',
            'hasOfficialPrice': False, 'evidence': {}}
    if not link_is_single(url):
        return {**base, 'status': 'invalid-url', 'reason': 'Not a valid Cardmarket Pokémon single URL'}
    try:
        card = find_card(target, fetch)
    except (ValueError, RuntimeError, KeyError, TypeError) as exc:
        return {**base, 'status': 'source-error', 'reason': str(exc)[:180]}

    ids = sorted(cm_product_ids(card))
    base['candidateIds'] = ids
    base['evidence'] = {'tcgdexCardId': card.get('id'), 'tcgdexSet': (card.get('set') or {}).get('id'),
                        'tcgdexNumber': card.get('localId')}
    if not ids:
        return {**base, 'status': 'missing-id', 'reason': 'TCGdex has no Cardmarket ID for this card'}
    if len(ids) != 1:
        return {**base, 'status': 'variant-review', 'reason': 'Multiple Cardmarket IDs for different printings'}
    pid = ids[0]
    catalog = products.get(pid)
    if not catalog:
        return {**base, 'status': 'unverified-id', 'reason': 'ID absent from official Cardmarket singles export'}
    if not catalog_name_matches(target['label'], str(catalog.get('name') or '')):
        expansion = catalog.get('idExpansion')
        possible = [
            {'id': p.get('idProduct'), 'name': p.get('name'), 'expansion': p.get('idExpansion')}
            for p in products.values()
            if p.get('idExpansion') == expansion
            and catalog_name_matches(target['label'], str(p.get('name') or ''))
        ][:12]
        return {**base, 'status': 'name-review', 'reason': 'TCGdex Cardmarket ID points to a different card name; do not use it automatically',
                'evidence': {**base['evidence'], 'cardmarketName': catalog.get('name'),
                             'possibleOfficialProducts': possible}}

    base['productId'] = pid
    base['hasOfficialPrice'] = pid in prices
    base['evidence'].update({'cardmarketName': catalog.get('name'), 'cardmarketExpansionId': catalog.get('idExpansion')})
    if target.get('variant'):
        return {**base, 'status': 'variant-review',
                'reason': f"Cardmarket ID identified, but {target['variant']} has no independent print evidence"}
    if pid not in prices:
        return {**base, 'status': 'no-price', 'reason': 'Product identified but absent from official price guide'}
    return {**base, 'status': 'confirmed', 'reason': 'TCGdex card identity + Cardmarket product ID/name match (expansion not separately verified)'}


def build(singles: Path, guide: Path, targets: Path, output: Path, fetch=get_json):
    catalog = json.loads(singles.read_text(encoding='utf-8'))
    price = json.loads(guide.read_text(encoding='utf-8'))
    spec = json.loads(targets.read_text(encoding='utf-8'))
    if catalog.get('version') != 1 or price.get('version') != 1:
        raise ValueError('Expected existing Keep & Flip Cardmarket JSON v1 exports')
    rows = catalog.get('products')
    price_rows = price.get('priceGuides')
    if not isinstance(rows, list) or not isinstance(price_rows, list):
        raise ValueError('Missing Cardmarket products or priceGuides')
    products = {r['idProduct']: r for r in rows if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    prices = {r['idProduct'] for r in price_rows if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    targets_list = spec.get('targets')
    if not isinstance(targets_list, list):
        raise ValueError('Targets must be an array')
    results = [resolve(t, products, prices, fetch) for t in targets_list]
    obj = {'schema': 'keepflip-cardmarket-identity-v1',
           'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'catalogCreatedAt': catalog.get('createdAt'), 'priceCreatedAt': price.get('createdAt'),
           'notes': 'Only configured cards; V1/V2 print versions remain review-only.',
           'results': results}
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(output)
    return obj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--singles', type=Path, default=Path('site/data/singles.json'))
    ap.add_argument('--prices', type=Path, default=Path('site/data/prices.json'))
    ap.add_argument('--targets', type=Path, default=Path('config/cardmarket_targets.json'))
    ap.add_argument('--out', type=Path, default=Path('site/data/card-identity.json'))
    options = ap.parse_args()
    obj = build(options.singles, options.prices, options.targets, options.out)
    for r in obj['results']:
        print(f"{r['label']}: {r['status']} {r['productId'] or ''} — {r['reason']}")


if __name__ == '__main__':
    main()
, '', official).strip()
    official = re.sub(r'\([^()]{0,25}\)


def resolve(target: dict, products: dict[int, dict], prices: set[int], fetch=get_json) -> dict:
    url = target['url']
    base = {'label': target['label'], 'url': url, 'tcgdexSetId': target['tcgdexSetId'],
            'language': target['language'], 'localNumber': target['localNumber'],
            'variant': target.get('variant', ''), 'productId': None,
            'candidateIds': [], 'status': 'unavailable', 'reason': '',
            'hasOfficialPrice': False, 'evidence': {}}
    if not link_is_single(url):
        return {**base, 'status': 'invalid-url', 'reason': 'Not a valid Cardmarket Pokémon single URL'}
    try:
        card = find_card(target, fetch)
    except (ValueError, RuntimeError, KeyError, TypeError) as exc:
        return {**base, 'status': 'source-error', 'reason': str(exc)[:180]}

    ids = sorted(cm_product_ids(card))
    base['candidateIds'] = ids
    base['evidence'] = {'tcgdexCardId': card.get('id'), 'tcgdexSet': (card.get('set') or {}).get('id'),
                        'tcgdexNumber': card.get('localId')}
    if not ids:
        return {**base, 'status': 'missing-id', 'reason': 'TCGdex has no Cardmarket ID for this card'}
    if len(ids) != 1:
        return {**base, 'status': 'variant-review', 'reason': 'Multiple Cardmarket IDs for different printings'}
    pid = ids[0]
    catalog = products.get(pid)
    if not catalog:
        return {**base, 'status': 'unverified-id', 'reason': 'ID absent from official Cardmarket singles export'}
    if not catalog_name_matches(target['label'], str(catalog.get('name') or '')):
        return {**base, 'status': 'name-review', 'reason': 'Cardmarket name differs from expected card',
                'evidence': {**base['evidence'], 'cardmarketName': catalog.get('name')}}

    base['productId'] = pid
    base['hasOfficialPrice'] = pid in prices
    base['evidence'].update({'cardmarketName': catalog.get('name'), 'cardmarketExpansionId': catalog.get('idExpansion')})
    if target.get('variant'):
        return {**base, 'status': 'variant-review',
                'reason': f"Cardmarket ID identified, but {target['variant']} has no independent print evidence"}
    if pid not in prices:
        return {**base, 'status': 'no-price', 'reason': 'Product identified but absent from official price guide'}
    return {**base, 'status': 'confirmed', 'reason': 'TCGdex card identity + Cardmarket product ID/name match (expansion not separately verified)'}


def build(singles: Path, guide: Path, targets: Path, output: Path, fetch=get_json):
    catalog = json.loads(singles.read_text(encoding='utf-8'))
    price = json.loads(guide.read_text(encoding='utf-8'))
    spec = json.loads(targets.read_text(encoding='utf-8'))
    if catalog.get('version') != 1 or price.get('version') != 1:
        raise ValueError('Expected existing Keep & Flip Cardmarket JSON v1 exports')
    rows = catalog.get('products')
    price_rows = price.get('priceGuides')
    if not isinstance(rows, list) or not isinstance(price_rows, list):
        raise ValueError('Missing Cardmarket products or priceGuides')
    products = {r['idProduct']: r for r in rows if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    prices = {r['idProduct'] for r in price_rows if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    targets_list = spec.get('targets')
    if not isinstance(targets_list, list):
        raise ValueError('Targets must be an array')
    results = [resolve(t, products, prices, fetch) for t in targets_list]
    obj = {'schema': 'keepflip-cardmarket-identity-v1',
           'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'catalogCreatedAt': catalog.get('createdAt'), 'priceCreatedAt': price.get('createdAt'),
           'notes': 'Only configured cards; V1/V2 print versions remain review-only.',
           'results': results}
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(output)
    return obj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--singles', type=Path, default=Path('site/data/singles.json'))
    ap.add_argument('--prices', type=Path, default=Path('site/data/prices.json'))
    ap.add_argument('--targets', type=Path, default=Path('config/cardmarket_targets.json'))
    ap.add_argument('--out', type=Path, default=Path('site/data/card-identity.json'))
    options = ap.parse_args()
    obj = build(options.singles, options.prices, options.targets, options.out)
    for r in obj['results']:
        print(f"{r['label']}: {r['status']} {r['productId'] or ''} — {r['reason']}")


if __name__ == '__main__':
    main()
, '', official).strip()
    return normalize(expected) == normalize(official)


def resolve(target: dict, products: dict[int, dict], prices: set[int], fetch=get_json) -> dict:
    url = target['url']
    base = {'label': target['label'], 'url': url, 'tcgdexSetId': target['tcgdexSetId'],
            'language': target['language'], 'localNumber': target['localNumber'],
            'variant': target.get('variant', ''), 'productId': None,
            'candidateIds': [], 'status': 'unavailable', 'reason': '',
            'hasOfficialPrice': False, 'evidence': {}}
    if not link_is_single(url):
        return {**base, 'status': 'invalid-url', 'reason': 'Not a valid Cardmarket Pokémon single URL'}
    try:
        card = find_card(target, fetch)
    except (ValueError, RuntimeError, KeyError, TypeError) as exc:
        return {**base, 'status': 'source-error', 'reason': str(exc)[:180]}

    ids = sorted(cm_product_ids(card))
    base['candidateIds'] = ids
    base['evidence'] = {'tcgdexCardId': card.get('id'), 'tcgdexSet': (card.get('set') or {}).get('id'),
                        'tcgdexNumber': card.get('localId')}
    if not ids:
        return {**base, 'status': 'missing-id', 'reason': 'TCGdex has no Cardmarket ID for this card'}
    if len(ids) != 1:
        return {**base, 'status': 'variant-review', 'reason': 'Multiple Cardmarket IDs for different printings'}
    pid = ids[0]
    catalog = products.get(pid)
    if not catalog:
        return {**base, 'status': 'unverified-id', 'reason': 'ID absent from official Cardmarket singles export'}
    if not catalog_name_matches(target['label'], str(catalog.get('name') or '')):
        return {**base, 'status': 'name-review', 'reason': 'Cardmarket name differs from expected card',
                'evidence': {**base['evidence'], 'cardmarketName': catalog.get('name')}}

    base['productId'] = pid
    base['hasOfficialPrice'] = pid in prices
    base['evidence'].update({'cardmarketName': catalog.get('name'), 'cardmarketExpansionId': catalog.get('idExpansion')})
    if target.get('variant'):
        return {**base, 'status': 'variant-review',
                'reason': f"Cardmarket ID identified, but {target['variant']} has no independent print evidence"}
    if pid not in prices:
        return {**base, 'status': 'no-price', 'reason': 'Product identified but absent from official price guide'}
    return {**base, 'status': 'confirmed', 'reason': 'TCGdex card identity + Cardmarket product ID/name match (expansion not separately verified)'}


def build(singles: Path, guide: Path, targets: Path, output: Path, fetch=get_json):
    catalog = json.loads(singles.read_text(encoding='utf-8'))
    price = json.loads(guide.read_text(encoding='utf-8'))
    spec = json.loads(targets.read_text(encoding='utf-8'))
    if catalog.get('version') != 1 or price.get('version') != 1:
        raise ValueError('Expected existing Keep & Flip Cardmarket JSON v1 exports')
    rows = catalog.get('products')
    price_rows = price.get('priceGuides')
    if not isinstance(rows, list) or not isinstance(price_rows, list):
        raise ValueError('Missing Cardmarket products or priceGuides')
    products = {r['idProduct']: r for r in rows if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    prices = {r['idProduct'] for r in price_rows if isinstance(r, dict) and isinstance(r.get('idProduct'), int)}
    targets_list = spec.get('targets')
    if not isinstance(targets_list, list):
        raise ValueError('Targets must be an array')
    results = [resolve(t, products, prices, fetch) for t in targets_list]
    obj = {'schema': 'keepflip-cardmarket-identity-v1',
           'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'catalogCreatedAt': catalog.get('createdAt'), 'priceCreatedAt': price.get('createdAt'),
           'notes': 'Only configured cards; V1/V2 print versions remain review-only.',
           'results': results}
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(output)
    return obj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--singles', type=Path, default=Path('site/data/singles.json'))
    ap.add_argument('--prices', type=Path, default=Path('site/data/prices.json'))
    ap.add_argument('--targets', type=Path, default=Path('config/cardmarket_targets.json'))
    ap.add_argument('--out', type=Path, default=Path('site/data/card-identity.json'))
    options = ap.parse_args()
    obj = build(options.singles, options.prices, options.targets, options.out)
    for r in obj['results']:
        print(f"{r['label']}: {r['status']} {r['productId'] or ''} — {r['reason']}")


if __name__ == '__main__':
    main()
