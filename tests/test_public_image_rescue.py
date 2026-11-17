import importlib.util,json,tempfile,unittest
from pathlib import Path

target=Path(__file__).parents[1]/"scripts"/"build_public_image_index.py"
spec=importlib.util.spec_from_file_location("image_rescue",target)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def p(title,handle,src,ptype="Pokemon TCG"):
    return {"title":title,"product_type":ptype,"handle":handle,
      "images":[{"src":src}],"tags":"Pokemon"}
BASE="https://rarecards.nl"
IMG="https://cdn.shopify.com/s/files/1/0777/files/151-bundle.png?v=123"
class TestImageRescue(unittest.TestCase):
    def test_img_sources_and_malicious_urls(self):
        self.assertEqual(m.clean_image(IMG,BASE),IMG)
        self.assertFalse(m.clean_image("http://cdn.shopify.com/s/files/1/abc.jpg",BASE))
        self.assertFalse(m.clean_image("https://evil.example/images/x.png",BASE))
        self.assertFalse(m.clean_image("https://cdn.shopify.com.evil.example/x.jpg",BASE))
        self.assertFalse(m.clean_image("https://rarecards.nl/malicious/x.png",BASE))
        self.assertFalse(m.clean_image("https://cdn.shopify.com@evil.example/x.png",BASE))
    def test_card_and_sealed_classify(self):
        self.assertEqual(m.classify({"title":"Pokemon 151 Booster Bundle"}),"sealed")
        self.assertEqual(m.classify({"title":"Pikachu ex 099/188"}),"card")
        self.assertEqual(m.language("Mega Lucario ex English 005/188"),"en")
        self.assertEqual(m.language("Pikachu JP 025/025"),"ja")
        self.assertEqual(m.language("Pokemon 151 Booster Bundle"),"")
    def test_build_and_matching_safety_metadata_only(self):
        product=p("Pokemon 151 Booster Bundle","pokemon-151-bundle",IMG)
        pages=[ [product],[],[] ]
        def fetch(origin,page,limit):
            return pages[page-1] if page<=len(pages) else []
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"rescue.json"
            doc=m.build(out,fetch_page=fetch,stores={"RareCards":BASE})
            self.assertEqual(len(doc["images"]),1)
            self.assertEqual(doc["images"][0]["kind"],"sealed")
            self.assertEqual(doc["images"][0]["sourcePage"],BASE+"/products/pokemon-151-bundle")
            self.assertFalse("inventory" in json.dumps(doc).lower())
            self.assertFalse("credits" in json.dumps(doc).lower())
    def test_preserve_last_known_images_when_shop_fails(self):
        old={"schema":m.SCHEMA,"images":[{"title":"Pokemon 151 Booster Bundle",
          "kind":"sealed","language":"","imageUrl":IMG,"sourcePage":BASE+"/products/pokemon-151-bundle","source":"RareCards"}]}
        with tempfile.TemporaryDirectory() as d:
            src=Path(d)/"previous.json";src.write_text(json.dumps(old))
            output=Path(d)/"out.json"
            def broken(*args):raise RuntimeError("failed")
            doc=m.build(output,existing=src,fetch_page=broken,stores={"RareCards":BASE})
            self.assertEqual(len(doc["images"]),1)
            self.assertTrue(doc["upstreamFailures"])
    def test_failed_first_refresh_never_writes_empty_dataset(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"index.json"
            def broken(*args):raise RuntimeError("denied")
            with self.assertRaises(RuntimeError):
                m.build(out,fetch_page=broken,stores={"RareCards":BASE})
            self.assertFalse(out.exists())
if __name__=="__main__":unittest.main()
