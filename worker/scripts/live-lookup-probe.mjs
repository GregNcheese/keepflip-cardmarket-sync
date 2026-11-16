/**
 * Real end-to-end public HTTP smoke tests for on-demand product autofill.
 * Uses a LOCAL dummy Bearer token inside the test process, never a user Secret.
 * This file is not bundled or used as a product data source.
 */
import worker from '../src/index.js';

const cases=[
  ['Pokemon Card 151 Japanese Booster Box','box','JP'],
  ['Pokemon TCG Simplified Chinese Gem Pack Vol 1 Booster Box','box','ZH-CN'],
  ['Scarlet & Violet Paldean Fates Booster Bundle','bundle','EN']
];
let matches=0;
for(const [name,type,language] of cases){
  const response = await worker.fetch(new Request('https://preview.example.workers.dev/lookup',{
    method:'POST',
    headers:{
      Authorization:'Bearer local-ephemeral-probe',
      Origin:'https://preview.example.workers.dev',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({productName:name,productType:type,language})
  }),{
    KEEPFLIP_ACCESS_TOKEN:'local-ephemeral-probe',
    APP_ORIGIN:'https://gregncheese.github.io',
    DIRECT_WEB_DISCOVERY:'true',
    ENABLE_GOOGLE_SEARCH:'false'
  });
  const body=await response.json();
  if(body.sourceVerified)matches++;
  console.log(JSON.stringify({
    product:name,http:response.status,status:body.status,
    packCount:body.suggestedCount,cardsPerPack:body.suggestedCardsPerPack,
    language:body.suggestedLanguage,
    verified:body.verifiedFields,
    live:body.diagnostics?.liveDiscovery,
    retail:body.diagnostics?.secondaryFetch,
    conflicts:body.diagnostics?.conflicts,
    verifiedSourceUrls:(body.sources||[]).filter(s=>s.kind==='retailer-product').map(s=>s.url)
  }));
}
console.log('Actual external-source backed lookups:',matches+'/'+cases.length);
if (matches===0) process.exitCode=1;
