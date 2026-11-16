import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from build_cardmarket_set_fallbacks import build_from_data


class SetFallbackTests(unittest.TestCase):
    def setUp(self):
        self.config={"schema":"keepflip-cardmarket-set-anchors-v1","sets":[{
            "setId":"CP6","setSlug":"Expansion-Pack-20th-Anniversary",
            "setName":"Expansion Pack 20th Anniversary","language":"ja",
            "anchorProductId":562471,"anchorName":"Ninetales"}]}
        self.rows=[{"idProduct":900000,"name":"Other","idExpansion":8}]*50000
        self.rows += [{"idProduct":562471,"name":"Ninetales [Lure | Fire Blast]","idExpansion":31}]
        self.rows += [{"idProduct":562472+i,"name":f"CP6 Pokémon {i}","idExpansion":31} for i in range(9)]
        self.official={"version":1,"createdAt":"2026-11-16","products":self.rows}

    def test_collects_all_and_only_one_expansion(self):
        x=build_from_data(self.config,self.official,"2026-11-16")
        self.assertEqual(len(x["sets"]),1)
        self.assertEqual(x["sets"][0]["count"],10)
        self.assertEqual(x["sets"][0]["cardmarketExpansionId"],31)
        self.assertEqual(x["sets"][0]["products"][0][0],562471)

    def test_wrong_anchor_name_must_fail(self):
        self.config["sets"][0]["anchorName"]="Delcatty"
        with self.assertRaisesRegex(ValueError,"wrong official name"):
            build_from_data(self.config,self.official,"2026-11-16")

    def test_wrong_anchor_id_must_fail(self):
        self.config["sets"][0]["anchorProductId"]=777777
        with self.assertRaises(ValueError):
            build_from_data(self.config,self.official,"2026-11-16")

    def test_empty_or_small_expansion_must_fail(self):
        self.official["products"] = self.rows[:50001]
        with self.assertRaisesRegex(ValueError,"Unexpected expansion size"):
            build_from_data(self.config,self.official,"2026-11-16")


if __name__=="__main__":
    unittest.main()
