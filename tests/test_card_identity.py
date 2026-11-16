import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_card_identity import build, cm_product_ids, resolve, same_number


def response_lookup(url):
    if url.endswith('/sets/sm10'):
        return {'cards': [{'id': 'sm10-042', 'localId': '042', 'name': 'マーシャドー'}]}
    if url.endswith('/cards/sm10-042'):
        return {'id': 'sm10-042', 'localId': '042', 'set': {'id': 'sm10'},
                'thirdParty': {'cardmarket': 557397}}
    raise RuntimeError('Fixture does not contain URL ' + url)


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.target = {'label':'Marshadow & Machamp GX', 'url':'https://www.cardmarket.com/en/Pokemon/Products/Singles/Double-Blaze/Marshadow-Machamp-GX-V1-sm10042',
                       'language':'ja', 'tcgdexSetId':'sm10', 'localNumber':'042', 'variant':'V1'}
        self.products = {557397: {'idProduct': 557397, 'name':'Marshadow & Machamp GX','idExpansion': 10}}

    def test_local_numbers_preserve_subsets(self):
        self.assertTrue(same_number('054', '54'))
        self.assertTrue(same_number('SV37', 'SV037'))
        self.assertFalse(same_number('SV37', '37'))
        self.assertFalse(same_number('052', '053'))

    def test_variant_requires_review(self):
        result = resolve(self.target, self.products, {557397}, fetch=response_lookup)
        self.assertEqual(result['productId'], 557397)
        self.assertEqual(result['status'], 'variant-review')

    def test_missing_official_id(self):
        result = resolve(self.target, {}, {557397}, fetch=response_lookup)
        self.assertEqual(result['status'], 'unverified-id')
        self.assertIsNone(result['productId'])

    def test_no_cardmarket_id_not_invented(self):
        self.assertEqual(cm_product_ids({'id':'a-1','variants_detailed':[{'type':'holo'}]}), set())

    def test_offline_build(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)
            (p/'singles.json').write_text(json.dumps({'version':1,'createdAt':'2026-11-13','products':list(self.products.values())}))
            (p/'prices.json').write_text(json.dumps({'version':1,'createdAt':'2026-11-13','priceGuides':[{'idProduct':557397,'trend':8.05}]}))
            (p/'targets.json').write_text(json.dumps({'targets':[self.target]}))
            result=build(p/'singles.json',p/'prices.json',p/'targets.json',p/'index.json',fetch=response_lookup)
            self.assertEqual(result['results'][0]['status'],'variant-review')
            self.assertTrue((p/'index.json').exists())


if __name__ == '__main__':
    unittest.main()
