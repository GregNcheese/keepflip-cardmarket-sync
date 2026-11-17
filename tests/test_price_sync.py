"""Offline checks: no Cardmarket network request and no private inventory access."""
import datetime as dt
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('build_data',Path(__file__).parents[1]/'scripts'/'build_data.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def fixture(kind,n,date=None):
    rows=[]
    for index in range(1,n+1):
        r={'idProduct':index,'idCategory':6}
        if kind=='prices':
            r.update(avg=2.4,low=1.5,trend=2.0,avg7=2.2)
        else:r.update(name=f'Card {index}',idExpansion=1)
        rows.append(r)
    return {'version':1,'createdAt':date or now(),
            ('priceGuides' if kind=='prices' else 'products'):rows}

class CardmarketPublicationSafety(unittest.TestCase):
    def test_successful_build_has_sha256_and_manifest_counts(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);source=root/'source';source.mkdir()
            for kind,name in [('singles','products_singles_6.json'),
                              ('sealed','products_nonsingles_6.json'),('prices','price_guide_6.json')]:
                (source/name).write_text(json.dumps(fixture(kind,5)))
            result=mod.build(root/'site',root/'cache',source,True)
            self.assertEqual(result['checks']['pricesValidated'],True)
            for kind in ('singles','sealed','prices'):
                item=result['sources'][kind]
                published=root/'site'/item['file']
                self.assertEqual(item['sha256'],hashlib.sha256(published.read_bytes()).hexdigest())
                self.assertEqual(item['bytes'],published.stat().st_size)
                self.assertEqual(item['count'],5)

    def test_negative_price_aborts_before_publish(self):
        doc=fixture('prices',1);doc['priceGuides'][0]['trend']=-1
        with self.assertRaises(ValueError):
            mod.validated('prices',doc)

    def test_stale_or_shrunken_daily_feed_does_not_overwrite_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);out=root/'site';cache=root/'cache'
            cache.mkdir()
            (cache/'prices.json').write_text(json.dumps(fixture('prices',1000)))
            data={'singles':fixture('singles',10),'sealed':fixture('sealed',10),
                  'prices':fixture('prices',5)}
            def fake_download(url):
                if 'products_singles' in url:return data['singles']
                if 'products_nonsingles' in url:return data['sealed']
                return data['prices']
            with patch.object(mod,'download',side_effect=fake_download):
                with self.assertRaisesRegex(ValueError,'source shrank'):
                    mod.build(out,cache,None,True)
            self.assertFalse((out/'manifest.json').exists())

    def test_old_daily_prices_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            old=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=9)).isoformat()
            def fake_download(url):
                if 'products_singles' in url:return fixture('singles',5)
                if 'products_nonsingles' in url:return fixture('sealed',5)
                return fixture('prices',5,old)
            with patch.object(mod,'download',side_effect=fake_download):
                with self.assertRaisesRegex(ValueError,'freshness window'):
                    mod.build(root/'out',root/'cache',None,True)
            self.assertFalse((root/'out'/'manifest.json').exists())

if __name__=='__main__': unittest.main()
