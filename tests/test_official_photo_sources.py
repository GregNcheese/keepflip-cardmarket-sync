import sys
from pathlib import Path
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from verify_official_photo_sources import allowed_card,check_card,page_check,build


def fake_page(card):
    return "<html><h1>公式カード情報 日本語 日本語 日本語 テスト画像情報テスト</h1><p>"+card["setCode"]+" "+card["localNumber"]+" / 095</p><footer>カードゲーム トレーナーズ</footer></html>"


class OfficialPhotosTests(unittest.TestCase):
    def setUp(self):
        self.card={
            "id":"sm10-042","language":"ja","name":"Marshadow & Machamp GX",
            "setCode":"SM10","setName":"Double Blaze","localNumber":"042",
            "cardmarketId":557397,"sourceCardId":36361,
            "sourcePage":"https://www.pokemon-card.com/card-search/details.php/card/36361/regu/XY",
            "imageUrl":"https://www.pokemon-card.com/assets/images/card_images/large/SM10/036361_P_MASHADOKAIRIKIGX.jpg"}

    def test_official_page_and_image_status_is_verified(self):
        self.assertTrue(allowed_card(self.card))
        r=check_card(self.card,lambda url:fake_page(self.card),lambda url:True)
        self.assertEqual(r["photoStatus"],"verified-official-card-image")
        self.assertTrue(r["photoUrl"].endswith(".jpg"))
        self.assertFalse(r["printVerified"])
        self.assertFalse(r["priceVerified"])

    def test_wrong_set_or_number_rejected(self):
        r=check_card(self.card,lambda url:"<html><p>SM11 054/094</p></html>",lambda url:True)
        self.assertEqual(r["photoStatus"],"source-mismatch")
        self.assertIsNone(r["photoUrl"])

    def test_external_image_domain_rejected(self):
        c={**self.card,"imageUrl":"https://evil.invalid/photo.jpg"}
        self.assertFalse(allowed_card(c))
        self.assertEqual(check_card(c)["photoStatus"],"invalid-input")

    def test_mismatched_photo_id_rejected(self):
        c={**self.card,"imageUrl":self.card["imageUrl"].replace("036361","036362")}
        self.assertFalse(allowed_card(c))

    def test_official_page_without_working_jpeg_rejected(self):
        r=check_card(self.card,lambda url:fake_page(self.card),lambda url:False)
        self.assertEqual(r["photoStatus"],"image-unavailable")

    def test_bad_original_content_not_published(self):
        r=check_card(self.card,lambda url:fake_page(self.card).replace("042","043"),lambda url:True)
        self.assertNotEqual(r["photoStatus"],"verified-official-card-image")

    def test_no_personal_card_data_in_public_index(self):
        config=Path(__file__).parents[1]/"config/official_japanese_photo_sources.json"
        data=config.read_text(encoding="utf-8")
        for key in ('purchaseId','shippingCents','costCents','sellerAddress'):
            self.assertNotIn(key,data)


if __name__=="__main__":
    unittest.main()
