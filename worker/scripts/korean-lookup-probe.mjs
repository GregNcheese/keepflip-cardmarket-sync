/**
 * Live end-to-end KR sealed lookup on PUBLIC product pages only.
 * No user secrets, no new API, no Gemini Search and no inventory.
 */
import worker from '../src/index.js';
const cases = [
  ['Pokemon Card 151 Korean Booster Box','box','KR'],
  ['Terastal Festival ex Korean Booster Box','box','KR'],
  ['Mega Symphonia Korean Booster Box','box','KR'],
  ['Pokemon Card 151 Japanese Booster Box','box','JP']
];
let verified=0,found=0;
for(const [productName,productType,language] of cases){
  const res=await worker.fetch(new Request('https://preview.example.workers.dev/lookup',{
    method:'POST',
    headers:{Authorization:'Bearer local-ephemeral-probe',Origin:'https://preview.example.workers.dev',
      'Content-Type':'application/json'},
    body:JSON.stringify({productName,productType,language})
  }),{
    KEEPFLIP_ACCESS_TOKEN:'local-ephemeral-probe',
    APP_ORIGIN:'https://gregncheese.github.io',
    DIRECT_WEB_DISCOVERY:'true',ENABLE_GOOGLE_SEARCH:'false'
  });
  const body=await res.json();
  const ok=!!body.verifiedFields?.boosters && !!body.verifiedFields?.cardsPerPack;
  verified+=Number(ok);
  found+=Number((body.diagnostics?.liveDiscovery?.matchedProducts||0)>0);
  console.log('KOREAN_LOOKUP '+JSON.stringify({
    productName,language,status:body.status,http:res.status,
    found:body.diagnostics?.liveDiscovery?.matchedProducts,
    providers:body.diagnostics?.liveDiscovery?.providers,
    packCount:body.suggestedCount,cardsPerPack:body.suggestedCardsPerPack,
    verified:body.verifiedFields,
    sources:(body.sources||[]).filter(x=>x.kind==='retailer-product').map(x=>x.url),
    fetch:body.diagnostics?.secondaryFetch,
    json:body.diagnostics?.productJsonFetch
  }));
  await new Promise(resolve=>setTimeout(resolve,800));
}
console.log('KOREAN_SUMMARY '+JSON.stringify({cases:cases.length,found,verifiedContents:verified}));
if(!found)process.exitCode=1;
