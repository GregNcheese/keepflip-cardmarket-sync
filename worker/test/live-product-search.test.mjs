import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { matchesLiveProductTitle, searchQueries, discoverLiveProductPages } from '../src/live-product-search.js';

const base = 'https://preview.example.workers.dev';
const jpName = 'Pokemon Card 151 Japanese Booster Box';
const jpUrl = 'https://rarecards.nl/en/products/pokemon-jp-151-booster-box';
const cnName = 'Pokemon TCG Simplified Chinese Gem Pack Vol 1 Booster Box';

test('strict live matching supports JP and CN without mixing EN or Pokemon Center', () => {
  assert.equal(matchesLiveProductTitle(jpName, 'Pokémon (JP) 151: Booster Box', 'box', 'JP'), true);
  assert.equal(matchesLiveProductTitle(jpName, 'Pokémon (EN) 151: Booster Box', 'box', 'JP'), false);
  assert.equal(matchesLiveProductTitle('Paldean Fates Elite Trainer Box',
    'Paldean Fates Pokemon Center Elite Trainer Box','etb','EN'), false);
  assert.equal(matchesLiveProductTitle('Pokemon Center Paldean Fates Elite Trainer Box',
    'Paldean Fates Pokemon Center Elite Trainer Box','etb','EN'), true);
  assert.equal(matchesLiveProductTitle(cnName,
    'Pokémon (CN) Gem Pack Vol.1: Booster Box','box','ZH-CN'), true);
  assert.equal(matchesLiveProductTitle(cnName,
    'Pokémon (JP) Gem Pack Vol.1: Booster Box','box','ZH-CN'), false);
  assert.equal(matchesLiveProductTitle('151 Japanese Booster Box', '151 JP Booster Box (no shrink)', 'box','JP'),false);
  assert.equal(matchesLiveProductTitle('151 Japanese Booster Box', '151 JP Booster Box Case', 'box','JP'),false);
  assert.equal(matchesLiveProductTitle('Paldean Fates Booster Bundle',
    'Paldean Fates Booster Bundle Display','bundle','EN'), false);
});

test('queries are created from the name, not from a product database', () => {
  assert.deepEqual(searchQueries(jpName, 'box'),['151 booster box','151']);
  assert.deepEqual(searchQueries('Paldean Fates Booster Bundle','bundle'),
    ['paldean fates booster bundle','paldean fates']);
  assert.deepEqual(searchQueries(cnName,'box'),['gem 1 booster box','gem 1']);
});

function fakeShopify(products=[]) {
  return new Response(JSON.stringify({
    resources: { results: { products } }
  }),{status:200,headers:{'Content-Type':'application/json'}});
}

test('Shopify public search returns exact candidate URL without a new API key', async () => {
  const orig=globalThis.fetch, called=[];
  globalThis.fetch=async input => {
    const url=String(input);called.push(url);
    if (url.includes('search/suggest.json')) {
      return fakeShopify(url.startsWith('https://rarecards.nl/') ? [
        {title:'Pokémon (JP) 151: Booster Box',url:'/en/products/pokemon-jp-151-booster-box'},
        {title:'Pokémon (EN) 151: Booster Box',url:'/en/products/pokemon-151-booster-box'},
        {title:'Pokémon (JP) 151: Booster Box',url:'https://evil.example/steal'}
      ]:[]);
    }
    throw Error('Unexpected network request');
  };
  try {
    const r=await discoverLiveProductPages({DIRECT_WEB_DISCOVERY:'true'},jpName,'box','JP');
    assert.deepEqual(r.retailUrls,[jpUrl]);
    assert.equal(r.status,'candidates-found');
    assert.equal(called.length,2);
    assert.equal(called.every(x=>x.includes('search/suggest.json')),true);
  } finally {globalThis.fetch=orig;}
});

test('malformed or blocked shop responses fail safely and never invent contents', async()=>{
  const orig=globalThis.fetch;
  globalThis.fetch=async()=>new Response('<html>blocked</html>',{
    status:200,headers:{'Content-Type':'text/html'}
  });
  try {
    const r=await discoverLiveProductPages({DIRECT_WEB_DISCOVERY:'true'},jpName,'box','JP');
    assert.equal(r.status,'no-exact-online-match');
    assert.deepEqual(r.retailUrls,[]);
  } finally {globalThis.fetch=orig;}
});

test('Worker fetches live JP sealed product, proves 20 x 7, skips Google Search', async()=>{
  const orig=globalThis.fetch, requests=[];
  globalThis.fetch=async input=>{
    const url=String(input);requests.push(url);
    if(url.includes('generativelanguage.googleapis.com')) throw Error('Paid grounding must never run');
    if(url.includes('api.tcgdex.net')) return new Response('[]',{headers:{'Content-Type':'application/json'}});
    if(url.includes('search/suggest.json'))return fakeShopify(
      url.startsWith('https://rarecards.nl/') ? [
        {title:'Pokémon (JP) 151: Booster Box',url:'/en/products/pokemon-jp-151-booster-box'}
      ]:[]
    );
    if(url===jpUrl)return new Response(
      '<html><main><h1>Pokémon (JP) 151: Booster Box</h1>'+
      '<p>Number of boosters per box: 20 packs</p>'+
      '<p>Number of cards per pack: 7 cards</p>'+
      '<p>Language: Japanese</p></main></html>',
      {headers:{'Content-Type':'text/html'}}
    );
    return new Response('Not Found',{status:404});
  };
  try {
    const response = await worker.fetch(new Request(base+'/lookup',{
      method:'POST',headers:{
        Authorization:'Bearer test-token',
        Origin:base,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        productName:jpName,productType:'box',language:'JP'
      })
    }),{
      KEEPFLIP_ACCESS_TOKEN:'test-token',
      APP_ORIGIN:'https://gregncheese.github.io',
      GEMINI_API_KEY:'fake-not-used',
      DIRECT_WEB_DISCOVERY:'true',
      ENABLE_GOOGLE_SEARCH:'false'
    });
    assert.equal(response.status,200);
    const out=await response.json();
    assert.equal(out.suggestedCount,20);
    assert.equal(out.suggestedCardsPerPack,7);
    assert.equal(out.suggestedLanguage,'JP');
    assert.equal(out.verifiedFields.boosters,true);
    assert.equal(out.verifiedFields.cardsPerPack,true);
    assert.equal(out.verifiedFields.productType,true);
    assert.equal(out.diagnostics.liveDiscovery.matchedProducts,1);
    assert.equal(out.diagnostics.googleDiscovery.status,'disabled-direct-search');
    assert.equal(requests.some(x=>x.includes('generativelanguage.googleapis.com')),false);
    assert.equal(out.sources.some(s=>s.url===jpUrl),true);
  } finally{globalThis.fetch=orig;}
});


test('Shopify text/javascript product endpoint verifies fields missing from HTML wrapper',async()=>{
  const saved=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=String(input);
    if (url.includes('api.tcgdex.net/'))return new Response('[]',{
      headers:{'Content-Type':'application/json'}
    });
    if (url.includes('search/suggest.json'))return fakeShopify(
      url.startsWith('https://rarecards.nl/') ?
        [{ title:'Pokémon (JP) 151: Booster Box',url:'/en/products/pokemon-jp-151-booster-box' }]:[]);
    if (url.endsWith('/pokemon-jp-151-booster-box.js'))return new Response(JSON.stringify({
      title:'Pokémon (JP) 151: Booster Box',
      description:'<p>Aantal booster packs per box: 20 packs</p><p>Aantal kaarten per pack: 7 kaarten</p><p>Taal: Japans</p>'
    }),{headers:{'Content-Type':'text/javascript; charset=utf-8'}});
    if (url.endsWith('/pokemon-jp-151-booster-box')) return new Response(
      '<html><h1>Pokémon (JP) 151: Booster Box</h1><script type="application/json">irrelevant data</script></html>',
      {headers:{'Content-Type':'text/html'}});
    return new Response('No',{status:404});
  };
  try {
    const response=await worker.fetch(new Request(base+'/lookup',{
      method:'POST',
      headers:{Authorization:'Bearer test-token',Origin:base,'Content-Type':'application/json'},
      body:JSON.stringify({ productName:jpName,productType:'box',language:'JP'})
    }),{
      KEEPFLIP_ACCESS_TOKEN:'test-token',APP_ORIGIN:'https://gregncheese.github.io',
      DIRECT_WEB_DISCOVERY:'true',ENABLE_GOOGLE_SEARCH:'false'
    });
    const out=await response.json();
    assert.equal(response.status,200);
    assert.equal(out.suggestedCount,20);
    assert.equal(out.suggestedCardsPerPack,7);
    assert.equal(out.suggestedLanguage,'JP');
    assert.equal(out.diagnostics.productJsonFetch[0].status,'verified-title');
  } finally{ globalThis.fetch=saved; }
});
