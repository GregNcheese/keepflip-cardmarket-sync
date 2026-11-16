#!/usr/bin/env python3
import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from build_quality_audit import (check_watchlist_card, coverage_report, canonical_name,
                                 valid_asset_base, verified_image, candidate_ids)


class QualityTests(unittest.TestCase):
    def setUp(self):
        self.entry={"label":"Jolteon ex","language":"ja","tcgdexId":"sv8a-052",
                    "expectedName":"Jolteon ex","variant":"V1","cardmarketCandidateId":803165}
        self.products={803165:{"name":"Jolteon ex [Flashing Spear | Dravite]","idExpansion":5928},
                       275811:{"name":"Delcatty [Scratch | Ultra Energy Source]","idExpansion":40},
                       562471:{"name":"Ninetales [Lure | Fire Blast]","idExpansion":3989}}
        self.card={"id":"sv8a-052","localId":"052","name":"サンダースex","set":{"id":"sv8a"},
                   "image":"https://assets.tcgdex.net/ja/sv/sv8a/052",
                   "thirdParty":{"cardmarket":803165}}

    def test_photo_url_must_be_owned_by_tcgdex(self):
        self.assertTrue(valid_asset_base("https://assets.tcgdex.net/ja/sv/sv8a/052"))
        self.assertFalse(valid_asset_base("https://evil.com/ja/sv/sv8a/052"))
        self.assertFalse(valid_asset_base("https://assets.tcgdex.net/../secret"))
        self.assertFalse(valid_asset_base("http://assets.tcgdex.net/ja/sv/sv8a/052"))

    def test_photo_verification_requires_working_asset(self):
        x=verified_image(self.card["image"], probe=lambda url: url.endswith("/low.webp"))
        self.assertEqual(x["status"],"asset-verified")
        y=verified_image(self.card["image"], probe=lambda url: False)
        self.assertEqual(y["status"],"asset-unavailable")
        self.assertIsNone(y["url"])

    def test_variant_never_auto_prices(self):
        result=check_watchlist_card(self.entry,self.products,
            fetch=lambda url: self.card, probe=lambda url: True)
        self.assertEqual(result["image"]["status"],"asset-verified")
        self.assertEqual(result["product"]["status"],"variant-or-image-review")
        self.assertFalse(result["canAutoPrice"])

    def test_wrong_houndoom_id_is_blocked(self):
        item={**self.entry,"label":"Team Magma's Houndoom","tcgdexId":"ex4-34",
              "expectedName":"Team Magma's Houndoom","cardmarketCandidateId":275811}
        detail={**self.card,"id":"ex4-34","thirdParty":{"cardmarket":275811}}
        result=check_watchlist_card(item,self.products,fetch=lambda url:detail, probe=lambda url:True)
        self.assertEqual(result["product"]["status"],"name-conflict")
        self.assertFalse(result["canAutoPrice"])

    def test_missing_cp6_card_does_not_become_fake_photo(self):
        item={**self.entry,"label":"Ninetales","tcgdexId":"CP6-015",
              "expectedName":"Ninetales","cardmarketCandidateId":562471,"variant":""}
        result=check_watchlist_card(item,self.products,fetch=lambda url:None)
        self.assertEqual(result["image"]["status"],"tcgdex-card-missing")
        self.assertEqual(result["product"]["status"],"variant-or-image-review")
        self.assertFalse(result["canAutoPrice"])

    def test_differentiates_empty_set_and_missing_image(self):
        indexes={"ja":{
            "schema":"keepflip-universal-cards-v1",
            "sets":[["CP6","20th Anniversary"],["sv8a","Terastal Festival"]],
            "cards":[["sv8a-052","sv8a","052","Jolteon",""],
                     ["sv8a-053","sv8a","053","Other","https://assets.tcgdex.net/ja/sv/sv8a/053"]]
        }}
        report=coverage_report(indexes)
        self.assertEqual(report["languages"]["ja"]["setsWithoutCards"],1)
        self.assertEqual(report["languages"]["ja"]["cardsWithoutImageUrl"],1)
        self.assertEqual(report["languages"]["ja"]["emptySets"][0]["id"],"CP6")

    def test_cardmarket_attack_description_is_not_new_name(self):
        self.assertEqual(canonical_name("Jolteon ex [Flashing Spear | Dravite]"),
                         canonical_name("Jolteon ex"))


if __name__=="__main__":
    unittest.main()
