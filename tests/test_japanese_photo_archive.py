import importlib.util,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("jpindex",Path(__file__).parents[1]/"scripts"/"build_japanese_photo_archive.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
URL="https://japanesepokecards.com/sets/ex-battle-boost-japanese-card-list/"
IMAGE="https://img.japanesepokecards.com/s/ex-battle-boost-japanese/ninetales-013-ex-battle-boost-japanese-sm.webp"
SET_HTML=f"""<html><a href="/sets/ex-battle-boost-japanese-card-list/">EX Battle Boost</a><a href="http://malicious.com/sets/bad-japanese-card-list/">Bad</a></html>"""
CARDS=f"""<html><img alt="Ninetales 013/093, EX Battle Boost Japanese card" src="{IMAGE}">
<img alt="Ninetales 013/093, EX Battle Boost Japanese card" src="{IMAGE}">
<img alt="Ninetales 014/093, EX Battle Boost Japanese card" src="https://evil.example/image.webp">
<img alt="Vulpix 012/093, EX Battle Boost Japanese card" src="http://img.japanesepokecards.com/fake.webp"></html>"""
class Archive(unittest.TestCase):
 def test_safe_set_pages(self):
  self.assertEqual(m.parse_sets(SET_HTML),[URL])
  self.assertFalse(m.page_url("https://attacker.example/sets/ex-battle-boost-japanese-card-list/"))
 def test_exact_photo_name_set_number_not_any_print_assumed(self):
  rec=m.parse_cards(CARDS,URL)
  self.assertEqual(len(rec),1)
  self.assertEqual(rec[0]["number"],"013/093")
  self.assertEqual(rec[0]["name"],"Ninetales")
  self.assertEqual(rec[0]["set"],"EX Battle Boost")
  self.assertEqual(rec[0]["imageUrl"],IMAGE)
  self.assertFalse(rec[0]["verifiedPrint"])
 def test_no_auto_japanese_english_mix(self):
  rec=m.parse_cards('<img alt="Pikachu 024/176, 30th Celebration Japanese card" src="'+IMAGE+'">',URL)
  self.assertEqual(rec[0]["language"],"ja")
 def test_fake_html_not_indexed(self):
  self.assertEqual(m.parse_cards('<img alt="Ninetales 013/093, EX Battle Boost Japanese card" src="https://evil.example/x.webp">',URL),[])
 def test_output_does_not_contain_collections(self):
  def fetch(url):
   return SET_HTML if url.endswith("/sets/") else CARDS
  with tempfile.TemporaryDirectory() as td:
   dest=Path(td)/"cards.json"
   doc=m.build(dest,fetch=fetch,check_robots=False)
   self.assertEqual(doc["cardCount"],1)
   self.assertIn("ex-battle-boost-japanese",dest.read_text())
   self.assertNotIn("userInventory",dest.read_text())
 def test_missing_set_fails_closed(self):
  with tempfile.TemporaryDirectory() as td:
   def fail(url):return "<html></html>"
   dest=Path(td)/"cards.json"
   with self.assertRaisesRegex(ValueError,"No publicly linked"):
    m.build(dest,fetch=fail,check_robots=False)
   self.assertFalse(dest.exists())
if __name__=="__main__":unittest.main()
