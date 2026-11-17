#!/usr/bin/env python3
"""Build a 200-case reproducible factual photo-identity benchmark.

No fabricated Pokemon cards: all general samples are from TCGdex bulk index
or an existing live public Japanese illustration index. The three pinned real
Cardmarket regression cases are explicitly marked reference-only where no
image has been verified. An expected candidate is not a verified print.
"""
import csv
import datetime as dt
import json
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import urlopen,Request

BASE="https://raw.githubusercontent.com/GregNcheese/keepflip-cardmarket-sync/"
UNIVERSAL=BASE+"test/universal-card-index-2219/test-data/universal-2219/universal-"
ARCHIVE=BASE+"test/japanese-photo-archive-22121/test-data/japanese-photo-22121/index.json"
QUOTAS={"en":100,"ja":90,"ko":4,"zh-cn":3,"zh-tw":3}
LABELS={"en":"Engels","ja":"Japans","ko":"Koreaans","zh-cn":"Chinees vereenvoudigd","zh-tw":"Chinees traditioneel"}
ANCHORS=[
 {"language":"ja","set":"EX Battle Boost","name":"Ninetales","number":"013/093","url":"https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Battle-Boost/Ninetales","origin":"Cardmarket + Japanse kaartindex","scenario":"historisch-japans"},
 {"language":"ja","set":"Dialga Half Deck","name":"Dialga Lv70","number":"DHD007","url":"https://www.cardmarket.com/en/Pokemon/Products/Singles/Dialga-Half-Deck/Dialga-Lv70-DHD007","origin":"Cardmarket (fotobron ontbreekt)","scenario":"historische-deckkaart-geen-foto"},
 {"language":"en","set":"30th Celebration","name":"Pikachu","number":"024","url":"https://www.cardmarket.com/en/Pokemon/Products/Singles/30th-Celebration/Pikachu-30C024","origin":"Cardmarket","scenario":"veel-pikachu-varianten"},
]
def get_json(url):
    with urlopen(Request(url,headers={"User-Agent":"KeepFlip-200-Regression/1.0","Accept":"application/json"}),timeout=55) as r:
        data=r.read(26_000_001)
    if len(data)>26_000_000:raise ValueError("source too big")
    return json.loads(data)
def digits(s):
    import re
    return "".join(c for c in str(s or "").casefold() if c.isalnum())
def key(r):
    return (r["language"],digits(r["set"]),digits(r["name"]),digits(r["number"]))
def make_case(lang,name,setname,number,source,photo="",source_url="",year=None,kind="catalog"):
    return {"language":lang,"languageLabel":LABELS[lang],"name":str(name).strip(),
      "set":str(setname).strip(),"number":str(number).strip(),
      "year":year if isinstance(year,int) and 1995<=year<=2027 else None,
      "source":source,"sourceUrl":source_url,
      "referencePhotoUrl":photo if isinstance(photo,str) else "",
      "scenario":kind,"status":"testcase","expected":"foto-kandidaat-met-handmatige-controle"}
def source_rows(lang,doc):
    if doc.get("schema")!="keepflip-universal-cards-v1" or doc.get("language")!=lang:
        raise ValueError("TCGdex source schema/language mismatch")
    sets=dict(doc["sets"])
    rows=[]
    for row in doc["cards"]:
        if not isinstance(row,list) or len(row)<4:continue
        card_id,setid,number,name=row[:4]
        setname=sets.get(setid)
        if not setname or not number or not name:continue
        img=row[4] if len(row)>4 else ""
        case=make_case(lang,name,setname,number,"TCGdex",
            img, "https://api.tcgdex.net/v2/"+lang+"/cards/"+card_id)
        case["sourceSetId"]=setid
        rows.append(case)
    return rows
def year_by_set(lang,get=get_json):
    try:
        raw=get("https://api.tcgdex.net/v2/"+lang+"/sets")
        result={}
        for row in raw:
            if isinstance(row,dict) and isinstance(row.get("releaseDate"),str):
                try:y=int(row["releaseDate"][:4])
                except ValueError:continue
                result[digits(row.get("name"))]=y
        return result
    except (OSError,ValueError,TypeError):
        return {}
def era_bucket(row):
    year=row.get("year")
    if year:return year_bucket(year)
    sid=str(row.get("sourceSetId") or "").lower()
    if sid.startswith(("base","gym","neo","ecard","ec","ex")):return "1996-2004"
    if sid.startswith(("dp","pl","hgss","hg","l","pt")):return "2005-2009"
    if sid.startswith(("bw","bwp","xy","xyp")):return "2010-2014"
    if sid.startswith(("sm","smp")):return "2015-2019"
    if sid.startswith(("swsh","swshp")):return "2020-2022"
    if sid.startswith(("sv","svp","me","m1","m2")):return "2023-2027"
    return "unknown"

def resolve_source_years(cases,get):
    targets={(c["language"],c.get("sourceSetId")) for c in cases if c.get("sourceSetId")}
    def one(v):
        lang,sid=v
        try:
            doc=get("https://api.tcgdex.net/v2/"+lang+"/sets/"+sid)
            if not isinstance(doc,dict):return (v,None)
            y=int(str(doc.get("releaseDate",""))[:4])
            return (v,y if 1995<=y<=2027 else None)
        except (OSError,ValueError,TypeError):
            return (v,None)
    years={}
    with ThreadPoolExecutor(max_workers=12) as executor:
        for entry,year in executor.map(one,sorted(targets)):
            years[entry]=year
    for c in cases:
        c["year"]=years.get((c["language"],c.get("sourceSetId")),c["year"])
    print("DATED_CASES",sum(c["year"] is not None for c in cases),
       "distinct years",sorted({c["year"] for c in cases if c["year"]}))
    return cases

def year_bucket(year):
    if not year:return "unknown"
    if year<=2004:return "1996-2004"
    if year<=2009:return "2005-2009"
    if year<=2014:return "2010-2014"
    if year<=2019:return "2015-2019"
    if year<=2022:return "2020-2022"
    return "2023-2027"
def pick_diverse(candidates,amount,already):
    # first pass: different sets AND eras, then additional distinct rows
    result=[];seen_set=set()
    filtered=[r for r in candidates if key(r) not in already]
    bins=defaultdict(list)
    for r in filtered:bins[era_bucket(r)].append(r)
    for rows in bins.values():
        rows.sort(key=lambda r:(digits(r["set"]),digits(r["number"]),digits(r["name"])))
    bucket_order=["1996-2004","2005-2009","2010-2014","2015-2019","2020-2022","2023-2027","unknown"]
    while len(result)<amount:
        changed=False
        for b in bucket_order:
            pool=bins[b]
            best=next((idx for idx,r in enumerate(pool) if digits(r["set"]) not in seen_set and key(r) not in already),None)
            if best is None:continue
            row=pool.pop(best);result.append(row);seen_set.add(digits(row["set"]))
            already.add(key(row));changed=True
            if len(result)>=amount:break
        if not changed:break
    if len(result)<amount:
        for b in bucket_order:
            for row in bins[b]:
                if key(row) not in already:
                    result.append(row);already.add(key(row))
                    if len(result)>=amount:break
            if len(result)>=amount:break
    return result
def build(destination,archive=None,universal=None,get=get_json):
    out=Path(destination);out.mkdir(parents=True,exist_ok=True)
    allcases=[];used=set()
    # Reference-only pinned cases: they are real cards, not assumed successes.
    for a in ANCHORS:
        x=make_case(a["language"],a["name"],a["set"],a["number"],
          a["origin"],source_url=a["url"],kind=a["scenario"])
        x["expected"]="manual-review-or-miss" if "geen-foto" in a["scenario"] else "review-without-price"
        if key(x) not in used:used.add(key(x));allcases.append(x)
    archive_doc=archive or get(ARCHIVE)
    if archive_doc.get("schema")!="keepflip-japanese-photo-index-v1":
        raise ValueError("Japanese archive source mismatch")
    jp_rows=[]
    for r in archive_doc["cards"]:
        if not all(r.get(k) for k in ("name","set","number","imageUrl","sourcePage")):continue
        x=make_case("ja",r["name"],r["set"],r["number"],
           "Japanese card set archive",r["imageUrl"],r["sourcePage"])
        jp_rows.append(x)
    # Explicitly include regional set-name example source cards, without
    # conflating their English printings.
    for setname in ["Battle Partners","MEGA Dream ex"]:
        sample=next((r for r in jp_rows if digits(r["set"])==digits(setname) and key(r) not in used),None)
        if sample:sample={**sample,"scenario":"verwante-jp-en-uitgave"}
        if sample and key(sample) not in used:
            allcases.append(sample);used.add(key(sample))
    for lang,quota in QUOTAS.items():
        need=quota-sum(r["language"]==lang for r in allcases)
        if need<0:raise ValueError("too many pinned cases for "+lang)
        doc=(universal or {}).get(lang) if universal else get(UNIVERSAL+lang+".json")
        rows=source_rows(lang,doc)
        yearmap=year_by_set(lang,get=get)
        for r in rows:r["year"]=yearmap.get(digits(r["set"]))
        if lang=="ja":
            # Cover archive-only vintage sets not in TCGdex.
            vintage_names=[
              "Pokémon VS","ADV Expansion Pack","EX Battle Boost","The Best of XY",
              "Premium Champion Pack","GX Ultra Shiny","Shiny Star V",
              "VSTAR Universe","Terastal Festival ex","Miracle Twin",
              "Double Blaze","Pokémon Card 151","25th Anniversary Collection"
            ]
            vintage=[]
            for s in vintage_names:
                match=next((r for r in jp_rows if digits(r["set"])==digits(s) and key(r) not in used),None)
                if match:vintage.append({**match,"scenario":"japans-historisch-archief"})
            for r in vintage[:min(14,need)]:
                allcases.append(r);used.add(key(r))
            need=quota-sum(r["language"]==lang for r in allcases)
            rows+=jp_rows
        selected=pick_diverse(rows,need,used)
        if len(selected)!=need:raise ValueError(f"Insufficient real {lang} cards for quota: {len(selected)}/{need}")
        allcases.extend(selected)
    if len(allcases)!=200:raise ValueError("Benchmark must contain exactly 200 cards: "+str(len(allcases)))
    if len({key(r) for r in allcases})!=200:raise ValueError("Duplicate cases")
    for r in allcases:
        if not r["name"] or not r["set"] or not r["number"] or r["language"] not in QUOTAS:
            raise ValueError("Invalid case")
    resolve_source_years(allcases,get)
    allcases.sort(key=lambda r:(["en","ja","ko","zh-cn","zh-tw"].index(r["language"]),era_bucket(r),r["set"].casefold(),r["number"],r["name"]))
    for i,r in enumerate(allcases,1):r["caseId"]=f"TC-{i:03d}"
    payload={"schema":"keepflip-photo-benchmark-v1","generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),
      "count":200,"languageCounts":dict(Counter(r["language"] for r in allcases)),
      "uniqueSets":len({(r["language"],digits(r["set"])) for r in allcases}),
      "uniqueYears":sorted({r["year"] for r in allcases if r["year"]}),
      "disclaimer":"These are genuine source catalogue entries and specific Cardmarket cases; source photo reference is not proof of precise printing/edition or successful runtime retrieval.",
      "cases":allcases}
    (out/"benchmark-200.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2))
    with (out/"benchmark-200.csv").open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,extrasaction="ignore",fieldnames=["caseId","language","languageLabel","year","set","sourceSetId","name","number","scenario","source","sourceUrl","referencePhotoUrl","expected","status"])
        w.writeheader();w.writerows(allcases)
    print("BENCHMARK_200",payload["count"],"LANGUAGES",payload["languageCounts"],"SETS",payload["uniqueSets"],"YEARS",payload["uniqueYears"])
    return payload
if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser();p.add_argument("--out",default="test-data/photo-benchmark-22122")
    a=p.parse_args();build(a.out)
