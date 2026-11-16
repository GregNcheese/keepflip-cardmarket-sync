#!/usr/bin/env python3
"""Existing Cardmarket relay plus an optional, non-blocking identity sidecar."""
import argparse
import datetime as dt
from pathlib import Path
import traceback

from build_data import build as build_official, write_json
from build_card_identity import build as build_identity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=Path('site/data'))
    parser.add_argument('--cache', type=Path, default=Path('.cache/cardmarket'))
    parser.add_argument('--source-dir', type=Path, default=None)
    parser.add_argument('--refresh-catalog', action='store_true')
    options = parser.parse_args()

    refresh = options.refresh_catalog or dt.datetime.now(dt.timezone.utc).weekday() == 4
    manifest = build_official(options.out, options.cache, options.source_dir, refresh)
    try:
        output = options.out / 'card-identity.json'
        data = build_identity(options.out / 'singles.json', options.out / 'prices.json',
                              Path('config/cardmarket_targets.json'), output)
        from collections import Counter
        status = Counter(result['status'] for result in data['results'])
        manifest['sources']['cardIdentity'] = {
            'file': output.name, 'schema': data['schema'], 'count': len(data['results']),
            'statusCounts': dict(status), 'source': 'Cardmarket export + TCGdex cards'
        }
        write_json(options.out / 'manifest.json', manifest)
        print('Card identity sidecar: '+str(dict(status)))
    except Exception:
        # Identity matching is optional. Never stop the daily official price
        # guide from being published because the experiment has failed.
        traceback.print_exc()
        print('WARNING: Card identity index was not updated; normal Cardmarket data remains available.')


if __name__ == '__main__':
    main()
