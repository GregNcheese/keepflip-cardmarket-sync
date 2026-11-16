import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_universal_index import make_language_index, build, SCHEMA, MANIFEST_SCHEMA


class UniversalIndexTests(unittest.TestCase):
    def test_build_from_set_and_card_briefs(self):
        x = make_language_index("ja", [{"id":"sv8a","name":"Terastal Festival ex"}],
            [{"id":"sv8a-052","localId":"052","name":"サンダースex",
              "image":"https://assets.tcgdex.net/ja/sv/sv8a/052"}], "2026-11-16")
        self.assertEqual(x["schema"], SCHEMA)
        self.assertEqual(x["cards"][0][:3], ["sv8a-052","sv8a","052"])
        self.assertEqual(x["coverage"]["indexedCards"], 1)

    def test_ambiguous_orphan_id_never_inferred(self):
        x = make_language_index("ja", [{"id":"sm10","name":"Double Blaze"}],
            [{"id":"unknown-042","localId":"042","name":"Machamp GX"}], "2026-11-16")
        self.assertEqual(x["cards"], [])
        self.assertEqual(x["coverage"]["state"], "not-populated")

    def test_malicious_image_not_copied(self):
        x = make_language_index("en", [{"id":"base1","name":"Base Set"}],
            [{"id":"base1-4","localId":"4","name":"Charizard",
              "image":"https://example.com/track.png"}], "2026-11-16")
        self.assertEqual(x["cards"][0][4], "")

    def test_duplicate_ids_deduplicated(self):
        c = {"id":"sm10-042", "localId":"042", "name":"Marshadow & Machamp GX"}
        x = make_language_index("ja", [{"id":"sm10","name":"Double Blaze"}], [c,c], "2026-11-16")
        self.assertEqual(len(x["cards"]), 1)

    def test_five_language_manifest_offline(self):
        def mocked_get(url):
            lang = url.split("/")[-2]
            return ([{"id":"s1","name":lang}] if url.endswith("/sets")
                    else [{"id":"s1-1","localId":"1","name":"Test"}])
        with tempfile.TemporaryDirectory() as d:
            manifest = build(Path(d), get=mocked_get)
            self.assertEqual(manifest["schema"], MANIFEST_SCHEMA)
            self.assertEqual(len(manifest["languages"]),5)
            for lang in ("en","ja","ko","zh-cn","zh-tw"):
                self.assertTrue((Path(d)/f"universal-{lang}.json").is_file())
                obj=json.loads((Path(d)/f"universal-{lang}.json").read_text())
                self.assertEqual(obj["coverage"]["indexedCards"],1)


if __name__ == "__main__":
    unittest.main()
