#!/usr/bin/env python3
"""Verify source-page identity and official Japanese Pokémon image links.

Publishes *URLs and provenance only*. Does not download, cache, rehost, or
redistribute copyrighted images. Results are for manual photo review, not
confirmation of Cardmarket V1/V2, holo, price or First Edition.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit

SCHEMA="keepflip-photo-rescue-v1"
SEED_SCHEMA="keepflip-official-card-photo-seeds-v1"
HOST="www.pokemon-card.com"
ALLOWED_LANGUAGES=("ja",)
MAX_PAGE=3_000_000

class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts=[]
        self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style"):self.skip+=1
        if tag=="img" and not self.skip:
            for key,value in attrs:
                if key in ("alt","title") and value:self.parts.append(str(value))
    def handle_endtag(self,tag):
        if tag in ("script","style") and self.skip:self.skip-=1
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def page_check(card,page_html):
    if not isinstance(page_html,str) or len(page_html)<80: return False
    p=VisibleText()
    p.feed(page_html)
    body=re.sub(r"\s+"," ", " ".join(p.parts)).upper()
    code=card["setCode"].upper()
    digits=str(int(card["localNumber"]))
    if not re.search(r"(?<![A-Z0-9])"+re.escape(code)+r"(?![A-Z0-9])",body):
        return False
    if not re.search(r"(?<![0-9])0*"+re.escape(digits)+r"(?![0-9])",body):
        return False
    # Official page may use an image thumbnail and a large photo URL.
    image_path=urlsplit(card["imageUrl"]).path
    filepart=image_path.rsplit("/",1)[-1]
    # Image id embedded in JPG is expected from the official card id.
    if not filepart.startswith(str(card["sourceCardId"]).zfill(6)+"_"):
        return False
    return True

def allowed_card(card):
    if card.get("language") not in ALLOWED_LANGUAGES:return False
    if not re.fullmatch(r"[A-Za-z0-9]{1,12}",str(card.get("setCode") or "")):return False
    if not re.fullmatch(r"[A-Za-z0-9]{1,12}",str(card.get("localNumber") or "")):return False
    if not re.fullmatch(r"[a-zA-Z0-9-]{4,80}",str(card.get("id") or "")):return False
    if not isinstance(card.get("sourceCardId"),int) or card["sourceCardId"]<=0:return False
    page=urlsplit(str(card.get("sourcePage") or ""))
    asset=urlsplit(str(card.get("imageUrl") or ""))
    if page.scheme!="https" or page.netloc!=HOST or page.query or page.fragment:return False
    if asset.scheme!="https" or asset.netloc!=HOST or asset.query or asset.fragment:return False
    if not re.fullmatch(r"/card-search/details\.php/card/\d{4,8}/regu/[A-Za-z]+",page.path):return False
    if not re.fullmatch(r"/assets/images/card_images/large/[A-Za-z0-9+_-]+/[A-Za-z0-9_-]+\.jpg",asset.path):return False
    if "/card/"+str(card["sourceCardId"])+"/" not in page.path:return False
    if asset.path.split("/")[5].lower()!=card["setCode"].lower():return False
    if not asset.path.rsplit("/",1)[-1].startswith(str(card["sourceCardId"]).zfill(6)+"_"):return False
    return True

def fetch_html(url):
    req=Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; KeepFlip-PhotoAudit/2.21.13)","Accept":"text/html"})
    with urlopen(req,timeout=25) as response:
        data=response.read(MAX_PAGE+1)
        if len(data)>MAX_PAGE:raise ValueError("Source HTML too large")
        return data.decode("utf-8","replace")

def probe_jpeg(url):
    req=Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; KeepFlip-PhotoAudit/2.21.13)","Accept":"image/jpeg","Range":"bytes=0-31"})
    with urlopen(req,timeout=25) as response:
        data=response.read(18)
        mime=str(response.headers.get("Content-Type","")).split(";")[0].strip().lower()
        return data.startswith(b"\xff\xd8\xff") and mime in ("image/jpeg","image/jpg")

def check_card(card,page_fetch=fetch_html,image_probe=probe_jpeg):
    record={
        "cardId":card.get("id"),"language":card.get("language"),
        "name":card.get("name"),"setCode":card.get("setCode"),
        "setName":card.get("setName"),"localNumber":card.get("localNumber"),
        "cardmarketCandidateId":card.get("cardmarketId"),
        "source":"pokemon-card.com official JP card database",
        "sourcePage":card.get("sourcePage"),
        "photoUrl":None,"photoStatus":"unavailable",
        "printVerified":False,"priceVerified":False,"details":"",
    }
    if not allowed_card(card):
        record["photoStatus"]="invalid-input"
        return record
    try:
        text=page_fetch(card["sourcePage"])
        if not page_check(card,text):
            debug=VisibleText();debug.feed(text)
            visible=re.sub(r"\\s+"," "," ".join(debug.parts))
            print("PAGE DIAGNOSTIC",card["id"],"chars",len(text),"setcode",card["setCode"] in visible.upper(),"number",card["localNumber"] in visible,"snippet",repr(visible[:140]))
            record["photoStatus"]="source-mismatch"
            record["details"]="Official page did not confirm the expected set and collector number"
            return record
        if not image_probe(card["imageUrl"]):
            record["photoStatus"]="image-unavailable"
            record["details"]="Official page confirmed but image URL failed JPEG test"
            return record
    except (OSError,ValueError,RuntimeError,HTTPError,URLError) as exc:
        record["details"]="Source request failed ("+type(exc).__name__+")"
        return record
    record["photoStatus"]="verified-official-card-image"
    record["photoUrl"]=card["imageUrl"]
    record["details"]="Official Japanese page set + collector number and JPEG are verified; variant still review-only"
    return record

def build(config:Path,out:Path,page_fetch=fetch_html,image_probe=probe_jpeg):
    doc=json.loads(config.read_text(encoding="utf-8"))
    if doc.get("schema")!=SEED_SCHEMA or not isinstance(doc.get("cards"),list) or len(doc["cards"])>2000:
        raise ValueError("Bad official image source config")
    seen=set()
    results=[]
    for c in doc["cards"]:
        if c.get("id") in seen:raise ValueError("Duplicate card id")
        seen.add(c.get("id"))
        r=check_card(c,page_fetch,image_probe)
        results.append(r)
        print(r["cardId"],r["photoStatus"],r["details"])
    output={"schema":SCHEMA,
            "generatedAt":datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "notes":"Only source URL metadata. Do not rehost images; card photo is not proof of print version.",
            "summary":{"checked":len(results),"officialImagesVerified":sum(r["photoStatus"]=="verified-official-card-image" for r in results)},
            "cards":results}
    out.parent.mkdir(parents=True,exist_ok=True)
    tmp=out.with_suffix(".tmp")
    tmp.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding="utf-8")
    tmp.replace(out)
    return output

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--config",type=Path,default=Path("config/official_japanese_photo_sources.json"))
    parser.add_argument("--out",type=Path,default=Path("test-data/photo-22113/official-photo-fallbacks.json"))
    a=parser.parse_args()
    build(a.config,a.out)
