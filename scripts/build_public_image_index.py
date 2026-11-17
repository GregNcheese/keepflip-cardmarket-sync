#!/usr/bin/env python3
"""A zero-key GitHub Actions photo-URL catalogue from public shop catalogues.

Never uploads private Keep & Flip inventory, downloads image bytes, hosts
copyrighted images or runs through Cloudflare. Listings are NOT confirmed
identity or printing; the browser displays REVIEW suggestions only.
"""
from __future__ import annotations
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit, urlencode
from urllib.request import urlopen,Request

SCHEMA="keepflip-github-image-rescue-v1"
STORES={
    "RareCards":"https://rarecards.nl",
    "CardNation":"https://www.cardnation.nl",
    "TCGHOBBY":"https://www.tcghobby.com"
}
MAX_PAGES=32
MAX_ROW_COUNT=25000
MAX_OUTPUT=7_000_000
def is_pokemon(row):
    tags=row.get("tags") or ""
    if isinstance(tags,list): tags=" ".join(str(x) for x in tags)
    hay=" ".join([str(row.get("title") or ""),str(row.get("product_type") or ""),
         str(row.get("vendor") or ""),tags]).lower()
    return "pokémon" in hay or "pokemon" in hay
def clean_image(raw,origin):
    if not isinstance(raw,str) or len(raw)>1200:return ""
    raw=raw.strip()
    if raw.startswith("//"):raw="https:"+raw
    if raw.startswith("/"):raw=origin+raw
    try:
        u=urlsplit(raw)
        allowed={urlsplit(x).hostname for x in STORES.values()}
        if u.scheme!="https" or u.username or u.password or u.port or \
           u.hostname not in ({"cdn.shopify.com"}|allowed) or \
           not (u.path.startswith("/cdn/shop/") or u.hostname=="cdn.shopify.com"):
            return ""
        if not re.search(r"\.(?:png|jpe?g|webp|avif)$",u.path,re.I):return ""
        return raw
    except Exception:return ""
def classify(row):
    name=(str(row.get("title") or "")+" "+str(row.get("product_type") or "")).lower()
    if re.search(r"booster box|booster bundle|booster pack|elite trainer|etb|ultra premium|upc|collection box|display|tin\b|blister|deck\b|premium collection|special collection",name):
        return "sealed"
    return "card"
def language(title):
    t=str(title).lower()
    if re.search(r"(?:\bjp\b|\bjpn\b|japanese|japans)",t):return "ja"
    if re.search(r"(?:\bkr\b|korean|koreaans)",t):return "ko"
    if re.search(r"(?:simplified chinese|chinese simplified|zh-cn)",t):return "zh-cn"
    if re.search(r"(?:traditional chinese|chinese traditional|zh-tw)",t):return "zh-tw"
    if re.search(r"(?:\ben\b|\beng\b|english|engels)",t):return "en"
    return ""   # The shop's country is NOT evidence of print language.
def records_for_shop(store,origin,products):
    out=[]
    for p in products:
        if not isinstance(p,dict) or not is_pokemon(p):continue
        title=str(p.get("title") or "").strip()[:220]
        handle=str(p.get("handle") or "").strip()
        if not title or not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,190}",handle):continue
        images=p.get("images") or []
        raw=(p.get("image") or {}).get("src") if isinstance(p.get("image"),dict) else ""
        if not raw and images:
            first=images[0]
            raw=first.get("src") if isinstance(first,dict) else first
        pic=clean_image(raw,origin)
        if not pic:continue
        out.append({"title":title,"kind":classify(p),"language":language(title),
          "imageUrl":pic,"sourcePage":origin+"/products/"+handle,"source":store})
    return out
def get_page(origin,page,limit):
    url=origin+"/products.json?"+urlencode({"limit":limit,"page":page})
    req=Request(url,headers={
      "User-Agent":"KeepFlip-ImageRescue/1.0 (+public product metadata, weekly; no image download)",
      "Accept":"application/json"
    })
    for attempt in range(3):
        try:
            with urlopen(req,timeout=27) as rsp:
                if rsp.status!=200:raise RuntimeError("upstream "+str(rsp.status))
                b=rsp.read(12_000_001)
                if len(b)>12_000_000:raise ValueError("page too big")
                obj=json.loads(b)
                rows=obj.get("products")
                if not isinstance(rows,list):raise ValueError("bad product response")
                return rows
        except (OSError,ValueError,RuntimeError):
            if attempt==2:raise
            time.sleep(attempt+1)
def scan_shop(store,origin,fetch_page=get_page,limit=250,max_pages=MAX_PAGES):
    out=[]
    zero_count=0
    for page in range(1,max_pages+1):
        rows=fetch_page(origin,page,limit)
        if not rows:
            zero_count+=1
            if zero_count>=2:break
        else:
            zero_count=0
        out.extend(records_for_shop(store,origin,rows))
        if len(out)>MAX_ROW_COUNT:raise ValueError("shop unexpectedly large")
        time.sleep(0.18)
    return out
def build(out,existing=None,fetch_page=get_page,stores=STORES):
    prior={}
    if existing and Path(existing).is_file():
        try:
            doc=json.loads(Path(existing).read_text(encoding="utf-8"))
            if doc.get("schema")==SCHEMA:
                for row in doc.get("images",[]):
                    if row.get("source") in stores and row.get("imageUrl") and row.get("sourcePage"):
                        prior.setdefault(row["source"],[]).append(row)
        except (OSError,ValueError,TypeError):pass
    grouped,failures={},[]
    for store,origin in stores.items():
        try:
            rows=scan_shop(store,origin,fetch_page=fetch_page)
            if not rows:raise ValueError("no usable public Pokemon images")
            grouped[store]=rows
        except (OSError,ValueError,RuntimeError) as e:
            failures.append(store+" ("+type(e).__name__+")")
            grouped[store]=prior.get(store,[])
        print(store,len(grouped[store]),"rows")
    unique={}
    for source,rows in grouped.items():
        for row in rows:
            url=clean_image(row.get("imageUrl"),stores[source])
            source_page=row.get("sourcePage","")
            if not url or not source_page.startswith(stores[source]+"/products/"):continue
            r=dict(row)
            r["imageUrl"]=url
            unique[(source,r.get("sourcePage"),r.get("imageUrl"))]=r
    if not unique:raise RuntimeError("No verified image metadata; do not publish empty index")
    if len(unique)>MAX_ROW_COUNT:raise ValueError("Unexpected index size")
    doc={
      "schema":SCHEMA,"generatedAt":datetime.now(timezone.utc).isoformat(),
      "imageKind":"retailer-public-URLs-only",
      "matchPolicy":"review-only; match set, language, print and product type before accepting",
      "sources":list(stores),"upstreamFailures":failures,
      "images":sorted(unique.values(),key=lambda r:(r["source"],r["title"]))
    }
    data=json.dumps(doc,separators=(",",":"),ensure_ascii=False)
    if len(data.encode())>MAX_OUTPUT:raise ValueError("index too big")
    out=Path(out);out.parent.mkdir(parents=True,exist_ok=True)
    temp=out.with_suffix(".tmp");temp.write_text(data,encoding="utf-8");temp.replace(out)
    print("INDEX_IMAGES",len(unique),"bytes",out.stat().st_size,"failures",failures)
    return doc
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--out",default="site/data/image-rescue.json")
    p.add_argument("--existing",default=None)
    p.add_argument("--pages",type=int,default=MAX_PAGES)
    args=p.parse_args()
    # Pages bound is deliberately fixed; CLI --pages is reserved for test usage.
    build(args.out,args.existing)
