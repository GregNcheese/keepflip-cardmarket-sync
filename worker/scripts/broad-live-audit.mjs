/**
 * Keep & Flip 2.1.8: BROAD REAL-WEB AUDIT (manual QA, NOT an app database).
 *
 * - Samples public Shopify predictive-search results, then checks additional
 *   product search questions across generations, languages, packaging.
 * - No product counts are hardcoded. No credentials, Gemini, inventory,
 *   screenshots, changes to stores, or collection data.
 * - Bounded 2 concurrent lookups, 2s+ (slow endpoints only), no retry on 429.
 * - Outputs temporary JSON report for Actions upload. Never pushes a registry.
 */
import worker from '../src/index.js';
import { inferProductType } from '../src/autofill.js';
import { mkdir, writeFile } from 'node:fs/promises';

const ORIGIN='https://preview.example.workers.dev';
const STORES=[
  { name:'RareCards',url:'https://rarecards.nl/en/search/suggest.json' },
  { name:'CardNation',url:'https://www.cardnation.nl/search/suggest.json' }
];
const SEARCHES=[
  'booster box','elite trainer box','booster bundle','booster pack',
  'ultra premium collection','japanese booster','korean booster','chinese booster',
  '151 booster','mega evolution','surging sparks','paldea','silver tempest',
  'prismatic evolutions','gem pack','sleeved booster','pokemon center elite trainer',
  'sun moon','sword shield','scarlet violet','shiny treasure',
  'terastal festival','ninja spinner','tag team','collect 151',
  'lost origin','fusion strike','destined rivals'
];
// Test questions, NOT an offline registry or source of product data.
// Deliberately include known current, older, and unlikely/unavailable titles.
// Expected card/pack counts are NEVER defined; the Worker must fetch proof.
const QUESTIONS=[
  ['Paldean Fates Booster Bundle','bundle','EN','EN modern'],
  ['Paldean Fates Elite Trainer Box','etb','EN','EN modern'],
  ['Paldean Fates Pokemon Center Elite Trainer Box','etb','EN','special edition'],
  ['Prismatic Evolutions Elite Trainer Box','etb','EN','EN modern'],
  ['Prismatic Evolutions Booster Bundle','bundle','EN','EN modern'],
  ['Scarlet Violet 151 Booster Bundle','bundle','EN','EN modern'],
  ['Scarlet Violet 151 Elite Trainer Box','etb','EN','EN modern'],
  ['Surging Sparks Booster Box','box','EN','EN modern'],
  ['Surging Sparks Booster Bundle','bundle','EN','EN modern'],
  ['Stellar Crown Booster Box','box','EN','EN modern'],
  ['Twilight Masquerade Booster Box','box','EN','EN modern'],
  ['Paldea Evolved Booster Box','box','EN','EN modern'],
  ['Obsidian Flames Elite Trainer Box','etb','EN','EN modern'],
  ['Paradox Rift Booster Box','box','EN','EN modern'],
  ['Temporal Forces Booster Box','box','EN','EN modern'],
  ['Shrouded Fable Booster Bundle','bundle','EN','EN modern'],
  ['Destined Rivals Booster Box','box','EN','EN modern'],
  ['Journey Together Booster Box','box','EN','EN modern'],
  ['Crown Zenith Elite Trainer Box','etb','EN','Sword Shield'],
  ['Lost Origin Booster Box','box','EN','Sword Shield'],
  ['Silver Tempest Booster Box','box','EN','Sword Shield'],
  ['Brilliant Stars Booster Box','box','EN','Sword Shield'],
  ['Evolving Skies Booster Box','box','EN','Sword Shield'],
  ['Fusion Strike Booster Box','box','EN','Sword Shield'],
  ['Astral Radiance Booster Box','box','EN','Sword Shield'],
  ['Chilling Reign Booster Box','box','EN','Sword Shield'],
  ['Celebrations Elite Trainer Box','etb','EN','Sword Shield'],
  ['Hidden Fates Elite Trainer Box','etb','EN','Sun Moon'],
  ['Cosmic Eclipse Booster Box','box','EN','Sun Moon'],
  ['Team Up Booster Box','box','EN','Sun Moon'],
  ['Unified Minds Booster Box','box','EN','Sun Moon'],
  ['Unbroken Bonds Booster Box','box','EN','Sun Moon'],
  ['XY Evolutions Booster Box','box','EN','XY legacy'],
  ['XY Flashfire Booster Box','box','EN','XY legacy'],
  ['Black White Plasma Storm Booster Box','box','EN','BW legacy'],
  ['151 Japanese Booster Box','box','JP','Japanese'],
  ['Shiny Treasure ex Japanese Booster Box','box','JP','Japanese'],
  ['Terastal Festival ex Japanese Booster Box','box','JP','Japanese'],
  ['VSTAR Universe Japanese Booster Box','box','JP','Japanese'],
  ['Super Electric Breaker Japanese Booster Box','box','JP','Japanese'],
  ['Battle Partners Japanese Booster Box','box','JP','Japanese'],
  ['Crimson Haze Japanese Booster Box','box','JP','Japanese'],
  ['Wild Force Japanese Booster Box','box','JP','Japanese'],
  ['Cyber Judge Japanese Booster Box','box','JP','Japanese'],
  ['Black Bolt Japanese Booster Box','box','JP','Japanese'],
  ['White Flare Japanese Booster Box','box','JP','Japanese'],
  ['Mega Brave Japanese Booster Box','box','JP','Japanese'],
  ['Mega Symphonia Japanese Booster Box','box','JP','Japanese'],
  ['Eevee Heroes Japanese Booster Box','box','JP','Japanese'],
  ['Tag Bolt Japanese Booster Box','box','JP','Japanese'],
  ['Shiny Star V Japanese Booster Box','box','JP','Japanese'],
  ['151 Korean Booster Box','box','KR','Korean'],
  ['Terastal Festival ex Korean Booster Box','box','KR','Korean'],
  ['Inferno X Korean Booster Box','box','KR','Korean'],
  ['Mega Brave Korean Booster Box','box','KR','Korean'],
  ['VSTAR Universe Korean Booster Box','box','KR','Korean'],
  ['Gem Pack Vol 1 Simplified Chinese Booster Box','box','ZH-CN','Chinese simplified'],
  ['Gem Pack Vol 2 Simplified Chinese Booster Box','box','ZH-CN','Chinese simplified'],
  ['151 Surprise Slim Chinese Booster Box','box','ZH-CN','Chinese simplified'],
  ['151 Surprise Jumbo Chinese Booster Box','box','ZH-CN','Chinese simplified'],
  ['151 Journey Slim Chinese Booster Box','box','ZH-CN','Chinese simplified'],
  ['151 Hope Slim Chinese Booster Box','box','ZH-CN','Chinese simplified'],
  ['Terastal Gathering Chinese Booster Box','box','ZH-CN','Chinese simplified'],
  ['Traditional Chinese 151 Booster Box','box','ZH-TW','Chinese traditional'],
  ['Traditional Chinese Eevee Heroes Booster Box','box','ZH-TW','Chinese traditional'],
  ['Traditional Chinese VMAX Climax Booster Box','box','ZH-TW','Chinese traditional'],
  ['Evolving Skies Booster Pack','pack','EN','loose pack'],
  ['Paldean Fates Booster Pack','pack','EN','loose pack'],
  ['Silver Tempest Booster Pack','pack','EN','loose pack'],
  ['151 Japanese Booster Pack','pack','JP','loose pack'],
  ['Scarlet Violet 151 Ultra Premium Collection','upc','EN','UPC'],
  ['Charizard Ultra Premium Collection','upc','EN','UPC']
];

const WAIT=ms=>new Promise(r=>setTimeout(r,ms));
const slug=s=>String(s||'').trim().toLowerCase().replace(/[‐‑‒–—]/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ');
const key=({name,type,language})=>[slug(name),type,language].join('|');
const langFromTitle=s=>/\b(?:JP|Japanese|JPN)\b/i.test(s)?'JP':
  /\b(?:KOR|KR|Korean)\b/i.test(s)?'KR':
  /\b(?:CN|Chinese|ZH-CN|Simplified)\b/i.test(s)?'ZH-CN':
  /\b(?:TW|Traditional Chinese|ZH-TW)\b/i.test(s)?'ZH-TW':
  /\b(?:EN|English)\b/i.test(s)?'EN':null;
const typeFromTitle=s=>inferProductType(s);
const config={ DIRECT_WEB_DISCOVERY:'true', ENABLE_GOOGLE_SEARCH:'false',
  KEEPFLIP_ACCESS_TOKEN:'local-broad-audit-token',APP_ORIGIN:'https://gregncheese.github.io' };
const seen=new Set(),cases=[];
function addCase(item) {
  if (!item.name || !item.type) return;
  const id=key(item);
  if(seen.has(id))return;
  seen.add(id); cases.push(item);
}
for(const [name,type,language,group] of QUESTIONS)addCase({name,type,language,group,origin:'question'});

async function sampleProducts(store, query) {
  const url=new URL(store.url);
  url.searchParams.set('q',query);
  url.searchParams.set('resources[type]','product');
  url.searchParams.set('resources[limit]','10');
  url.searchParams.set('resources[options][unavailable_products]','show');
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    let response;
    try{response=await fetch(url,{signal:controller.signal,redirect:'manual',headers:{Accept:'application/json'}});}
    finally{clearTimeout(timer);}
    if(!response.ok)return {status:'http-'+response.status,results:[]};
    const json=await response.json();
    const list=json?.resources?.results?.products;
    return {status:'ok',results:Array.isArray(list)?list.map(x=>({name:String(x?.title||'').trim(),source:store.name})):[]};
  }catch{return {status:'unavailable',results:[]};}
}
const samples=[],harvestFailures=[];
for(const term of SEARCHES){
  const responses=await Promise.all(STORES.map(x=>sampleProducts(x,term)));
  for(let i=0;i<responses.length;i++){
    if(responses[i].status!=='ok')harvestFailures.push({source:STORES[i].name,term,status:responses[i].status});
    for(const row of responses[i].results){
      const type=typeFromTitle(row.name);
      if(!type)continue;
      // Skip bundle-case, pack blister, and multi-product lots.
      if(/\b(?:case of|case|blister|display of bundles|half box|mystery box)\b/i.test(row.name))continue;
      const language=langFromTitle(row.name);
      samples.push({name:row.name,type,language,group:'live store sample',origin:row.source});
    }
  }
  await WAIT(130);
}
// Select diverse real catalog titles, instead of keeping only recent EN boxes.
const sampled=[...new Map(samples.map(x=>[key(x),x])).values()];
const byBucket=new Map();
for(const sample of sampled){
  const bucket=(sample.language||'UNSPECIFIED')+' / '+sample.type;
  if(!byBucket.has(bucket))byBucket.set(bucket,[]);
  byBucket.get(bucket).push(sample);
}
const keys=[...byBucket.keys()].sort();
const sampleCap=Math.min(75,Number(process.env.SAMPLE_LIMIT||75));
for(let round=0;round<50&&cases.length<QUESTIONS.length+sampleCap;round++){
  let added=false;
  for(const bucket of keys){
    const sample=byBucket.get(bucket)?.shift();
    if(sample){
      const before=cases.length;addCase(sample);
      if(cases.length>before)added=true;
      if(cases.length>=QUESTIONS.length+sampleCap)break;
    }
  }
  if(!added)break;
}
console.log('AUDIT_DISCOVERY '+JSON.stringify({
  explicitQuestions:QUESTIONS.length,harvestedRecords:samples.length,
  distinctHarvested:sampled.length,totalCases:cases.length,
  harvestedBuckets:Object.fromEntries([...byBucket].map(([x,y])=>[x,y.length])),
  harvestFailures
}));
if(cases.length<30)throw Error('Too few diverse cases to run a meaningful broad test');

// Live network only. Cache TCGdex set catalogs WITHIN this one test run; this
// reduces repeated catalog requests while retaining real public data.
const trueFetch=globalThis.fetch;
const setCatalog=new Map();
globalThis.fetch=(input,init)=>{
  const url=typeof input==='string'?input:input?.url||String(input);
  if (/^https:\/\/api\.tcgdex\.net\/v2\/(?:en|ja|ko|zh-cn|zh-tw)\/sets$/.test(url)) {
    if(!setCatalog.has(url)){
      setCatalog.set(url,Promise.resolve().then(()=>trueFetch(input,init))
        .then(async r=>({body:await r.text(),status:r.status,
          headers:{'Content-Type':r.headers.get('Content-Type')||'application/json'}})));
    }
    return setCatalog.get(url).then(r=>new Response(r.body,{status:r.status,headers:r.headers}));
  }
  return trueFetch(input,init);
};

const result=[];
const maxCases=Math.min(160,Math.max(20,Number(process.env.MAX_CASES||120)));
const runCases=cases.slice(0,maxCases);
let next=0;
async function runOne(row,index){
  const started=Date.now();
  try{
    const response=await worker.fetch(new Request(ORIGIN+'/lookup',{
      method:'POST',
      headers:{Authorization:'Bearer local-broad-audit-token',Origin:ORIGIN,'Content-Type':'application/json'},
      body:JSON.stringify({productName:row.name,productType:row.type,...(row.language?{language:row.language}:{})})
    }),config);
    const value=await response.json();
    const found=(value.diagnostics?.liveDiscovery?.matchedProducts||0)>0;
    const confirmed=value.verifiedFields||{};
    return {
      id:index+1,name:row.name,type:row.type,language:row.language||'UNSPECIFIED',
      group:row.group,origin:row.origin,status:value.status||'unknown',http:response.status,
      found,full:!!confirmed.boosters&&!!confirmed.cardsPerPack,
      verified:{boosters:!!confirmed.boosters,cards:!!confirmed.cardsPerPack,
        language:!!confirmed.language,set:!!confirmed.set,productType:!!confirmed.productType},
      counts:{boosters:value.suggestedCount??null,cardsPerPack:value.suggestedCardsPerPack??null},
      candidateCount:value.diagnostics?.liveDiscovery?.matchedProducts??0,
      providerStatus:value.diagnostics?.liveDiscovery?.providers??[],
      pages:value.diagnostics?.secondaryFetch??[],
      productJson:value.diagnostics?.productJsonFetch??[],
      conflicts:value.diagnostics?.conflicts??[],
      sourceUrls:(value.sources||[]).filter(x=>x.kind==='retailer-product').map(x=>x.url),
      milliseconds:Date.now()-started
    };
  }catch(e){
    return {id:index+1,name:row.name,type:row.type,language:row.language||'UNSPECIFIED',
      status:'audit-error',found:false,full:false,error:String(e?.message||e).slice(0,160),
      milliseconds:Date.now()-started};
  }
}
async function workerLoop(){
  while(next<runCases.length){
    const idx=next++;const row=runCases[idx];
    const r=await runOne(row,idx);result[idx]=r;
    console.log('AUDIT_CASE '+JSON.stringify({
      id:r.id,language:r.language,type:r.type,name:r.name,found:r.found,
      full:r.full,boosters:r.counts?.boosters??null,cardsPerPack:r.counts?.cardsPerPack??null,
      source:r.sourceUrls?.[0]||null,
      issue:r.status==='audit-error'?r.error:r.conflicts?.length?'source-conflict':r.found&&!r.full?'missing-proof':!r.found?'not-found':null
    }));
    await WAIT(300);
  }
}
await Promise.all([workerLoop(),workerLoop()]);
const count=(rows,p)=>rows.filter(p).length;
const grouped=(field)=>{
  const map={};
  for(const r of result){
    const k=r[field]||'UNKNOWN';
    if(!map[k])map[k]={total:0,found:0,full:0,boosters:0,cards:0,languages:0,sets:0,conflicts:0};
    const m=map[k];m.total++;m.found+=Number(r.found);m.full+=Number(r.full);
    m.boosters+=Number(r.verified?.boosters||false);m.cards+=Number(r.verified?.cards||false);
    m.languages+=Number(r.verified?.language||false);m.sets+=Number(r.verified?.set||false);
    m.conflicts+=Number(!!r.conflicts?.length);
  }
  return map;
};
const summary={
  runAt:new Date().toISOString(),cases:result.length,
  publicSourceCandidates:count(result,x=>x.found),
  verifiedBothContents:count(result,x=>x.full),
  verifiedBoosterCounts:count(result,x=>x.verified?.boosters),
  verifiedCardsPerPack:count(result,x=>x.verified?.cards),
  verifiedCardLanguage:count(result,x=>x.verified?.language),
  verifiedSet:count(result,x=>x.verified?.set),
  conflicts:count(result,x=>x.conflicts?.length),
  errors:count(result,x=>x.status==='audit-error'),
  byLanguage:grouped('language'),byType:grouped('type'),byOrigin:grouped('origin'),
  missing:result.filter(x=>!x.full).length,
  note:'Findability and verified proof are different; no pack-count registry or Gemini queries used.'
};
const report={summary,discovery:{sampled:sampled.length,harvestFailures},
  cases:result};
await mkdir('worker/audit-results',{recursive:true});
await writeFile('worker/audit-results/broad-live-audit.json',JSON.stringify(report,null,2));
console.log('AUDIT_SUMMARY '+JSON.stringify(summary));
console.log('AUDIT_MISSING_EXAMPLES '+JSON.stringify(result.filter(x=>!x.full).slice(0,30).map(x=>({
  name:x.name,language:x.language,type:x.type,found:x.found,
  reason:x.status,source:x.sourceUrls?.[0]||null
}))));
