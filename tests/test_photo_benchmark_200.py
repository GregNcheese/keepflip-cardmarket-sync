import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("benchmark",
  Path(__file__).parents[1]/"scripts"/"build_photo_benchmark_200.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Benchmark(unittest.TestCase):
 def test_quotas_are_exactly_200(self):
  self.assertEqual(sum(m.QUOTAS.values()),200)
  self.assertEqual(m.QUOTAS["en"],100)
  self.assertEqual(m.QUOTAS["ja"],90)
 def test_real_source_schema_rejects_invented_cards(self):
  with self.assertRaises(ValueError):
   m.source_rows("en",{"schema":"invented","language":"en","sets":[],"cards":[]})
 def test_english_rows_have_original_source_ids(self):
  x=m.source_rows("en",{"schema":"keepflip-universal-cards-v1","language":"en",
    "sets":[["base1","Base Set"]],"cards":[["base1-4","base1","4","Charizard",
      "https://assets.tcgdex.net/en/base/base1/4"]]})
  self.assertEqual(x[0]["name"],"Charizard")
  self.assertEqual(x[0]["set"],"Base Set")
  self.assertIn("base1-4",x[0]["sourceUrl"])
 def test_diversity_prefers_distinct_sets(self):
  a=[m.make_case("ja","Pikachu","Series "+str(i),"001","TCGdex",year=2001+i) for i in range(14)]
  used=set();selected=m.pick_diverse(a,8,used)
  self.assertEqual(len(selected),8)
  self.assertEqual(len({x["set"] for x in selected}),8)
 def test_language_and_identity_do_not_collapse(self):
  a=m.make_case("ja","Pikachu","Battle Partners","001","TCGdex")
  b=m.make_case("en","Pikachu","Journey Together","001","TCGdex")
  self.assertNotEqual(m.key(a),m.key(b))
 def test_named_regression_references_are_real_links(self):
  self.assertEqual(len(m.ANCHORS),3)
  self.assertTrue(all(x["url"].startswith("https://www.cardmarket.com/en/Pokemon/") for x in m.ANCHORS))
if __name__=="__main__":unittest.main()
