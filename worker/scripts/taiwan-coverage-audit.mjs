/**
 * Regional regression: live Taiwan Pokémon sealed product coverage.
 * Temporary test questions only, no persistent catalog and no credentials.
 */
import worker from '../src/index.js';
import { inferProductType } from '../src/autofill.js';
import {mkdir,writeFile} from 'node:fs/promises';

const origin='https://www.tcghobby.com';
const terms=[
  'traditional chinese pokemon booster box',
  'simplified chinese pokemon booster box',
  'pokemon 30th celebration booster box',
  'pokemon glory of team rocket booster box',
  'pokemon mega dream booster box',
  'traditional chinese sun moon',
  'traditional chinese sword shield',
  'pokemon raging surf booster box',
  'pokemon gem pack booster box',
  'pokemon booster pack traditional chinese'
];
const seeds=[
  {name:'Pokemon Glory of Team Rocket sv10 Traditional Chinese Booster Box',type:'box',language:'ZH-TW',origin:'explicit'},
  {name:'Pokemon Raging Surf Traditional Chinese Booster Box',type:'box',language:'ZH-TW',origin:'explicit'},
  {name:'Pokemon Mega Dream m2aF Traditional Chinese Booster Box',type:'box',language:'ZH-TW',origin:'explicit'},
  {name:'Pokemon 30th Celebration M6aF Traditional Chinese Booster Box',type:'box',language:'ZH-TW',origin:'explicit'}
];
const waited=ms=>new Promise(r=>setTimeout(r,ms));
const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const all=[...seeds],seen=new Set(seeds.map(x=>[norm(x.name),x.type].join('|')));
const sourceHealth=[];
for(const term of terms) {
  const u=new URL('/en-gb/search/suggest.json',origin);
  u.searchParams.set('q',term);
  u.searchParams.set('resources[type]','product');
  u.searchParams.set('resources[limit]','10');
  let status='unreachable',list=[];
  try{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
    const response=await fetch(u,{headers:{Accept:'application/json'},signal:controller.signal,redirect:'manual'}).finally(()=>clearTimeout(timeout));
    status='http-'+response.status;
    if(response.ok){
      const data=await response.json();list=data?.resources?.results?.products||[];
      if(!Array.isArray(list))list=[];
    }
  }catch{}
  sourceHealth.push({query:term,status,candidates:list.length});
  for(const row of list){
    const title=String(row?.title||'').trim();
    if(!/pok[eé]mon/i.test(title))continue;
    const type=inferProductType(title);
    if(!type||/\b(?:case of|display case|box case|blister|sleeves|card case)\b/i.test(title))continue;
    const lang=/traditional chinese|繁體中文/i.test(title)?'ZH-TW':
      /simplified chinese|简体中文/i.test(title)?'ZH-CN':
      /\b(?:japanese|JP)\b/i.test(title)?'JP':
      /\b(?:korean|KOR)\b/i.test(title)?'KR':null;
    if(!lang)continue;
    const k=[norm(title),type].join('|');
    if(seen.has(k))continue;
    seen.add(k);all.push({name:title,type,language:lang,origin:'live-taiwan-title'});
  }
  await waited(400);
}
const cases=all.slice(0,32);
const env={
  KEEPFLIP_ACCESS_TOKEN:'local-tw-audit-token',
  APP_ORIGIN:'https://gregncheese.github.io',
  ENABLE_GOOGLE_SEARCH:'false',
  DIRECT_WEB_DISCOVERY:'true'
};
const result=[];
for(let i=0;i<cases.length;i++){
  const row=cases[i];
  try{
    const request=new Request('https://preview.example.workers.dev/lookup',{
      method:'POST',headers:{Origin:'https://preview.example.workers.dev',
        Authorization:'Bearer local-tw-audit-token','Content-Type':'application/json'},
      body:JSON.stringify({productName:row.name,productType:row.type,language:row.language})
    });
    const response=await worker.fetch(request,env);
    const output=await response.json();
    const matches=output.diagnostics?.liveDiscovery?.matchedProducts||0;
    const v=output.verifiedFields||{};
    const relevant=row.type==='pack'?!!v.cardsPerPack:(!!v.boosters&&!!v.cardsPerPack);
    result.push({
      name:row.name,type:row.type,language:row.language,origin:row.origin,
      status:output.status,found:matches>0,
      verifiedContents:relevant,
      verified:{boosters:!!v.boosters,cards:!!v.cardsPerPack,language:!!v.language,productType:!!v.productType,set:!!v.set},
      counts:{boosters:output.suggestedCount??null,cardsPerPack:output.suggestedCardsPerPack??null},
      sources:(output.sources||[]).filter(s=>s.kind==='retailer-product').map(s=>s.url),
      sourceDiagnostics:output.diagnostics?.productJsonFetch||[],
      conflictingFields:output.diagnostics?.conflicts||[]
    });
  }catch(e){
    result.push({name:row.name,type:row.type,language:row.language,origin:row.origin,
      status:'audit-error',found:false,verifiedContents:false,error:String(e?.name||'Error')});
  }
  const last=result[result.length-1];
  console.log('TAIWAN_CASE '+JSON.stringify({index:i+1,name:row.name,found:last.found,
    verified:last.verifiedContents,counts:last.counts||null,
    source:last.sources?.[0]||null,conflicts:last.conflictingFields?.length||0}));
  await waited(1700);
}
const count=p=>result.filter(p).length;
const summary={
  runAt:new Date().toISOString(),
  queries:terms.length,
  total:result.length,
  found:count(x=>x.found),
  verifiedContents:count(x=>x.verifiedContents&&x.sources?.length),
  verifiedLanguage:count(x=>x.verified?.language),
  errors:count(x=>x.status==='audit-error'),
  conflicts:count(x=>x.conflictingFields?.length),
  traditional:{
    total:count(x=>x.language==='ZH-TW'),
    found:count(x=>x.language==='ZH-TW'&&x.found),
    verified:count(x=>x.language==='ZH-TW'&&x.verifiedContents&&x.sources?.length)
  },
  simplified:{
    total:count(x=>x.language==='ZH-CN'),
    found:count(x=>x.language==='ZH-CN'&&x.found),
    verified:count(x=>x.language==='ZH-CN'&&x.verifiedContents&&x.sources?.length)
  }
};
await mkdir('worker/audit-results',{recursive:true});
await writeFile('worker/audit-results/taiwan-coverage.json',JSON.stringify({summary,sourceHealth,cases:result},null,2));
console.log('TAIWAN_SUMMARY '+JSON.stringify(summary));
console.log('TAIWAN_SEARCHES '+JSON.stringify(sourceHealth));
