#!/usr/bin/env python3
"""GitHub-only public Japanese card-illustration URL index.

Crawls set LIST PAGES, not member accounts or search APIs.
Never stores image bytes, price claims, print authenticity or user inventory.
Obeys robots.txt and keeps delays/caps; fails closed on absent useful data.
"""
from __future__ import annotations
from datetime import datetime,timezone
from html.parser import HTMLParser
from urllib.request import Request,urlopen
from urllib.parse import urljoin,urlsplit
from urllib import robotparser
import argparse,json,re,time
from pathlib import Path

ROOT="https://japanesepokecards.com"
HOST="japanesepokecards.com"
IMAGE="img.japanesepokecards.com"
SCHEMA="keepflip-japanese-photo-index-v1"
USER_AGENT="KeepFlip-PhotoMeta/1.0 (GitHub Actions; public links only; no image downloading)"
MAX_SETS=240
MAX_CARDS=40000
MAX_BYTES=13_000_000
ALT=re.compile(r"^(.+?)\s+(\d{2,4})\s*/\s*(\d{2,4}),\s*(.+?)\s+Japanese card$",re.I)

def page_url(url):
    u=urlsplit(url)
    return (u.scheme=="https" and u.hostname==HOST and not u.username and
            u.port is None and re.fullmatch(
                r"/sets/[a-z0-9-]{5,160}-japanese-card-list/?",u.path) is not None)

def valid_image(src):
    try:
        u=urlsplit(src)
        return (u.scheme=="https" and u.hostname==IMAGE and u.port is None
                and not u.username and bool(re.fullmatch(
                    r"/s/[a-z0-9-]{5,180}/[a-z0-9-]{5,220}\.(?:webp|jpe?g|png)",u.path,re.I)))
    except Exception:return False

class SetIndex(HTMLParser):
    def __init__(self):super().__init__();self.links=set()
    def handle_starttag(self,tag,attrs):
        if tag!="a":return
        attr=dict(attrs);href=attr.get("href")
        if not href:return
        target=urljoin(ROOT,href)
        if page_url(target):self.links.add(target.split("#")[0].split("?")[0])

class CardPage(HTMLParser):
    def __init__(self):super().__init__();self.cards=[]
    def handle_starttag(self,tag,attrs):
        if tag!="img":return
        a=dict(attrs);alt=a.get("alt","").strip()
        m=ALT.fullmatch(alt)
        if not m:return
        src=""
        for key in ("src","data-src","data-lazy-src"):
            value=a.get(key,"")
            if not value:continue
            cand=urljoin(ROOT,value) if not value.startswith("//") else "https:"+value
            if valid_image(cand):src=cand;break
        if not src:return
        name,num,total,setname=[x.strip() for x in m.groups()]
        if not name or not setname or len(name)>100 or len(setname)>110:return
        self.cards.append({"name":name,"set":setname,"number":num.zfill(3)+"/"+total.zfill(3),
                           "imageUrl":src,"language":"ja"})

def fetch_html(url):
    with urlopen(Request(url,headers={"User-Agent":USER_AGENT,"Accept":"text/html"}),timeout=16) as res:
        raw=res.read(4_000_001)
        if len(raw)>4_000_000:raise ValueError("HTML too large")
        return raw.decode("utf-8","replace")

def parse_sets(html):
    p=SetIndex();p.feed(html);return sorted(p.links)
def parse_cards(html,url):
    if not page_url(url):return []
    p=CardPage();p.feed(html)
    seen=set();out=[]
    for row in p.cards:
        key=(row["set"].casefold(),row["name"].casefold(),row["number"])
        if key in seen:continue
        seen.add(key)
        out.append({**row,"sourcePage":url,"source":"japanesepokecards.com","verifiedPrint":False})
    return out

def robots_allowed():
    url=ROOT+"/robots.txt"
    try:
        with urlopen(Request(url,headers={"User-Agent":USER_AGENT}),timeout=12) as r:
            if r.status>=400:return True
            txt=r.read(200_000).decode("utf-8","replace")
        robots=robotparser.RobotFileParser();robots.parse(txt.splitlines())
        return robots.can_fetch(USER_AGENT,ROOT+"/sets/") and robots.can_fetch(USER_AGENT,
            ROOT+"/sets/ex-battle-boost-japanese-card-list/")
    except Exception:
        # Avoid false permission assumptions when robots cannot be checked.
        return False

def build(destination,previous=None,fetch=fetch_html,check_robots=True,max_sets=MAX_SETS):
    if check_robots and not robots_allowed():
        raise RuntimeError("robots.txt could not be verified or disallows this index")
    pages=parse_sets(fetch(ROOT+"/sets/"))
    if not pages:raise ValueError("No publicly linked Japanese set pages")
    pages=pages[:max_sets]
    history={}
    if previous and Path(previous).exists():
        try:
            old=json.loads(Path(previous).read_text(encoding="utf-8"))
            if old.get("schema")==SCHEMA:
                for row in old.get("cards",[]):
                    if page_url(row.get("sourcePage","")) and valid_image(row.get("imageUrl","")):
                        history.setdefault(row["sourcePage"],[]).append(row)
        except (OSError,ValueError,TypeError):pass
    results={};misses=[]
    for index,url in enumerate(pages,1):
        try:
            rows=parse_cards(fetch(url),url)
            if not rows:raise ValueError("No named card images")
            results[url]=rows
        except (OSError,ValueError,RuntimeError) as e:
            misses.append(url+" ("+type(e).__name__+")")
            results[url]=history.get(url,[])
        if index%25==0:print("PROGRESS",index,"/",len(pages),"cards",sum(map(len,results.values())))
        time.sleep(.26)
    records=[];seen=set()
    for page,rows in results.items():
        for r in rows:
            key=(r["set"].casefold(),r["name"].casefold(),r["number"],r["imageUrl"])
            if key in seen:continue
            seen.add(key)
            records.append(r)
    if not records:raise RuntimeError("No image URLs collected; abort empty index publication")
    if len(records)>MAX_CARDS:raise ValueError("Too many records")
    doc={"schema":SCHEMA,"generatedAt":datetime.now(timezone.utc).isoformat(),
         "cardCount":len(records),"setPages":len(pages),"failedPages":len(misses),
         "failures":misses[:50],
         "notes":"Source URLs only; review photo and printing; no image file copies or price assertions.",
         "cards":sorted(records,key=lambda x:(x["set"],x["name"],x["number"]))}
    content=json.dumps(doc,ensure_ascii=False,separators=(",",":"))
    if len(content.encode("utf-8"))>MAX_BYTES:raise ValueError("Index size exceeded")
    output=Path(destination);output.parent.mkdir(parents=True,exist_ok=True)
    temp=output.with_suffix(".tmp");temp.write_text(content,encoding="utf-8");temp.replace(output)
    print("JAPANESE_INDEX_IMAGES",len(records),"sets",len(pages),"missing_pages",len(misses))
    for row in records:
        if row["name"].lower()=="ninetales" and row["set"].lower()=="ex battle boost":
            print("JAPANESE_EBB_NINETALES",row["number"],row["imageUrl"])
    return doc

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--out",default="test-data/japanese-photo-22121/index.json")
    p.add_argument("--previous",default="")
    args=p.parse_args()
    build(args.out,args.previous or None)
