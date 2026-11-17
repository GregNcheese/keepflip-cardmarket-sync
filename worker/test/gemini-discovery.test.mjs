import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  discoverProductWithGemini, parseGroundedProductUrls
} from '../src/gemini-discovery.js';

const base = 'https://late-smoke-2a21.chokorii.workers.dev';
const official = 'https://www.pokemon.com/us/pokemon-tcg/product-gallery/sv-aurora-chorus-booster-bundle';
const regularEtb = 'https://www.pokemon.com/us/pokemon-tcg/product-gallery/aurora-chorus-elite-trainer-box';
const retail = 'https://www.gamestop.com/toys-games/trading-cards/products/aurora-chorus-booster-bundle/123.html';
const name = 'Scarlet Violet Aurora Chorus Booster Bundle';
const allowOfficial = url => {
  try { const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.pokemon.com'?u.href:null; }
  catch {return null;}
};
const allowRetail = url => {
  try {const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.gamestop.com'?u.href:null;}
  catch{return null;}
};
function aiResponse(text, chunks = [official], searches = ['Aurora Chorus Booster Bundle official']) {
  return {
    candidates: [{
      content:{parts:[{text}]},
      groundingMetadata:{
        groundingChunks:chunks.map(uri=>({web:{uri,title:'Search result'}})),
        webSearchQueries:searches,
        searchEntryPoint:{renderedContent:'<div class="search-suggestion">Verified Search</div>'}
      }
    }]
  };
}
async function offlineLookup(product, {geminiResponse, pages={}, sets=[], noKey=false,
                                    noSearch=false, geminiStatus=200}={}) {
  const original=globalThis.fetch;
  const calls={gemini:0,official:[]};
  globalThis.fetch = async (input,init) => {
    const url=String(input);
    if (url.includes('generativelanguage.googleapis.com')) {
      calls.gemini++;
      const payload=JSON.parse(init?.body||'{}');
      assert.deepEqual(payload.tools,[{googleSearch:{}}]);
      assert.equal(payload.contents.length,1);
      return new Response(JSON.stringify(geminiResponse||{candidates:[{content:{parts:[]}}]}),{
        status:geminiStatus,headers:{'Content-Type':'application/json'}
      });
    }
    if (url.includes('api.tcgdex.net/')) return new Response(JSON.stringify(sets), {
      status:200,headers:{'Content-Type':'application/json'}
    });
    calls.official.push(url);
    if (Object.hasOwn(pages,url)) return new Response(pages[url],{
      status:200,headers:{'Content-Type':'text/html'}
    });
    return new Response('Not found',{status:404});
  };
  try {
    const response=await worker.fetch(new Request(base+'/lookup',{
      method:'POST',
      headers:{Authorization:'Bearer test-secret',Origin:'https://keepflip.example','Content-Type':'application/json'},
      body:JSON.stringify(product)
    }),{
      KEEPFLIP_ACCESS_TOKEN:'test-secret', APP_ORIGIN:'https://keepflip.example',
      ...(noKey?{}:{GEMINI_API_KEY:'unit-test-fake-key'}),
      ENABLE_GOOGLE_SEARCH:noSearch?'false':'true'
    });
    assert.equal(response.status,200);
    return {result:await response.json(),calls};
  } finally {
    globalThis.fetch=original;
  }
}

test('rejects all AI links if Google grounding metadata is absent',()=>{
  const r=parseGroundedProductUrls({candidates:[{content:{parts:[{text:official}]}}]},
    allowOfficial,allowRetail);
  assert.equal(r.status,'no-grounding');
  assert.deepEqual(r.officialUrls,[]);
  assert.equal(r.groundingUsed,false);
});

test('extracts actual source candidates, filters to official/approved retailers, returns Google suggestions',()=>{
  const r=parseGroundedProductUrls(aiResponse([
    official,retail,'https://127.0.0.1/admin',
    'https://www.evil.example/guess',
  ].join('\n'),['https://vertexaisearch.cloud.google.com/grounding-api-redirect/opaque']),
  allowOfficial,allowRetail);
  assert.equal(r.status,'grounded');
  assert.deepEqual(r.officialUrls,[official]);
  assert.deepEqual(r.retailUrls,[retail]);
  assert.equal(r.searchQueries.length,1);
  assert.match(r.searchSuggestionsHtml,/Verified Search/);
});

test('no API key means zero Gemini calls and no guessed counts',async()=>{
  const {result,calls}=await offlineLookup({productName:name,productType:'bundle'},{
    noKey:true
  });
  assert.equal(result.diagnostics.googleDiscovery.status,'missing-api-key');
  assert.equal(calls.gemini,0);
  assert.equal(result.suggestedCount,null);
  assert.equal(result.verifiedFields.boosters,false);
});

test('disabled Search does not use Gemini discovery even when key is present',async()=>{
  const {result,calls}=await offlineLookup({productName:name,productType:'bundle'},{
    noSearch:true
  });
  assert.equal(result.diagnostics.googleDiscovery.status,'disabled');
  assert.equal(calls.gemini,0);
});

test('Gemini discovers unknown product, but only exact independently fetched page verifies fields',async()=>{
  const page='<html><main><h1>'+name+'</h1>'+
    '<p>Includes 6 booster packs. Each booster pack contains 10 game cards.</p>'+
    '<p>Card language: English</p></main></html>';
  const {result,calls}=await offlineLookup({productName:name,productType:'bundle'},{
    geminiResponse:aiResponse('Exact official product page: '+official,[
      'https://vertexaisearch.cloud.google.com/grounding-api-redirect/opaque'
    ]),
    pages:{[official]:page},
    sets:[{name:'Aurora Chorus',id:'test-001'}]
  });
  assert.equal(calls.gemini,1);
  assert.ok(calls.official.includes(official));
  assert.equal(result.suggestedCount,6);
  assert.equal(result.suggestedCardsPerPack,10);
  assert.equal(result.suggestedSet,'Aurora Chorus');
  assert.equal(result.suggestedLanguage,'EN');
  assert.equal(result.verifiedFields.boosters,true);
  assert.equal(result.verifiedFields.cardsPerPack,true);
  assert.equal(result.groundingUsed,true);
  assert.equal(result.googleSearchEnabled,true);
  assert.equal(result.diagnostics.googleDiscovery.officialCandidates,1);
  assert.match(result.searchSuggestionsHtml,/Verified Search/);
  assert.equal(result.status,'match');
  assert.equal(result.version,'2.1.8');
});

test('Gemini textual claims alone never count as verified product data',async()=>{
  const {result,calls}=await offlineLookup({productName:name,productType:'bundle'},{
    geminiResponse:aiResponse('Official page '+official+' has 99 booster packs and 44 cards.'),
    pages:{},
    sets:[{name:'Aurora Chorus',id:'test-001'}]
  });
  assert.equal(calls.gemini,1);
  assert.equal(result.suggestedCount,null);
  assert.equal(result.suggestedCardsPerPack,null);
  assert.equal(result.verifiedFields.boosters,false);
});

test('Gemini cannot confuse normal ETB with Pokémon Center edition',async()=>{
  const question='Scarlet Violet Aurora Chorus Elite Trainer Box';
  const page='<html><h1>Scarlet Violet Aurora Chorus Pokemon Center Elite Trainer Box</h1><p>Includes 11 booster packs.</p></html>';
  const {result}=await offlineLookup({productName:question,productType:'etb'},{
    geminiResponse:aiResponse('Product page '+regularEtb,[regularEtb]),
    pages:{[regularEtb]:page}
  });
  assert.equal(result.suggestedCount,null);
  assert.equal(result.verifiedFields.boosters,false);
});

test('Gemini HTTP failure does not break lookup',async()=>{
  const {result,calls}=await offlineLookup({productName:name,productType:'bundle'},{
    geminiStatus:429
  });
  assert.equal(calls.gemini,1);
  assert.equal(result.diagnostics.googleDiscovery.status,'gemini-http-429');
  assert.equal(result.suggestedCount,null);
  assert.equal(result.requiresConfirmation,true);
});

test('Gemini discovery makes only one Google Search request per lookup',async()=>{
  const {calls}=await offlineLookup({productName:name,productType:'bundle'},{
    geminiResponse:aiResponse('Retail page '+retail,[retail])
  });
  assert.equal(calls.gemini,1);
});

test('a non-grounded answer with plausible URLs is ignored',async()=>{
  const {result}=await offlineLookup({productName:name,productType:'bundle'},{
    geminiResponse:{candidates:[{content:{parts:[{text:official+' 36 packs'}]}}]},
    pages:{[official]:'<html><h1>'+name+'</h1><p>Includes 36 booster packs.</p></html>'}
  });
  assert.equal(result.diagnostics.googleDiscovery.status,'no-grounding');
  assert.equal(result.verifiedFields.boosters,false);
});

test('Gemini can find a correct retailer product page when no official page is reachable',async()=>{
  const html='<html><main><h1>'+name+'</h1>'+
    '<p>Includes 6 booster packs. Each booster pack contains 10 game cards.</p>'+
    '<p>Card language: English</p></main></html>';
  const {result,calls}=await offlineLookup({productName:name,productType:'bundle'},{
    geminiResponse:aiResponse('Found direct retail product page '+retail,[retail]),
    pages:{[retail]:html},
    sets:[{name:'Aurora Chorus',id:'test-001'}]
  });
  assert.equal(calls.gemini,1);
  assert.equal(result.diagnostics.googleDiscovery.retailerCandidates,1);
  assert.equal(result.suggestedCount,6);
  assert.equal(result.suggestedCardsPerPack,10);
  assert.equal(result.suggestedLanguage,'EN');
  assert.equal(result.verifiedFields.boosters,true);
  assert.equal(result.verifiedFields.cardsPerPack,true);
  assert.equal(result.status,'partial'); // Product type remains name-hint, no official h1.
  assert.ok(result.sources.some(x=>x.kind==='retailer-product'));
});

test('retailer with wrong card language or product edition is rejected',async()=>{
  const page='<html><h1>Scarlet Violet Aurora Chorus Pokemon Center Booster Bundle</h1>'+
    '<p>Includes 11 booster packs. Card language: Japanese.</p></html>';
  const {result}=await offlineLookup({productName:name,productType:'bundle'},{
    geminiResponse:aiResponse('Product listing '+retail,[retail]),
    pages:{[retail]:page}
  });
  assert.equal(result.suggestedCount,null);
  assert.equal(result.verifiedFields.boosters,false);
});

test('Gemini request only contains public name/type/language, never inventory or tokens',async()=>{
  const saved=globalThis.fetch;
  let body;
  globalThis.fetch=async (url,options)=>{
    body=JSON.parse(options.body);
    assert.equal(options.headers['x-goog-api-key'],'unit-test-secret');
    return new Response(JSON.stringify(aiResponse(official)),{
      status:200,headers:{'Content-Type':'application/json'}
    });
  };
  try {
    const r=await discoverProductWithGemini(
      {ENABLE_GOOGLE_SEARCH:'true',GEMINI_API_KEY:'unit-test-secret'},
      'Unknown Japanese Booster Bundle', 'bundle', 'JP', allowOfficial,allowRetail
    );
    assert.equal(r.status,'grounded');
    assert.equal(r.officialUrls[0],official);
    assert.equal(body.generationConfig.maxOutputTokens,850);
    assert.deepEqual(body.tools,[{googleSearch:{}}]);
    assert.doesNotMatch(JSON.stringify(body),/unit-test-secret/);
  } finally {globalThis.fetch=saved}
});


test('Google 429 preserves safe quota diagnostics, without exposing raw error text', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Sensitive internal quota details should never be exposed',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [{ description: 'Quota exceeded: GenerateContentRequestsPerDayPerProject' }]
        },
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '7.5s'
        }
      ]
    }
  }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  try {
    const result = await discoverProductWithGemini({
      ENABLE_GOOGLE_SEARCH: 'true',
      GEMINI_API_KEY: 'secret-must-not-appear'
    }, 'Pokemon Card 151 Japanese Booster Box', 'box', 'JP', allowOfficial, allowRetail);
    assert.equal(result.status, 'gemini-http-429');
    assert.equal(result.errorStatus, 'RESOURCE_EXHAUSTED');
    assert.equal(result.errorCategory, 'daily-quota');
    assert.equal(result.retryAfterSeconds, 8);
    assert.equal(result.groundingUsed, false);
    assert.equal(result.searchQueries.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /Sensitive internal|secret-must-not-appear/);
  } finally { globalThis.fetch = saved; }
});

test('429 with unstructured response remains safe and explains uncertainty', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response('unstructured error', { status: 429 });
  try {
    const result = await discoverProductWithGemini({
      ENABLE_GOOGLE_SEARCH: 'true', GEMINI_API_KEY: 'fake'
    }, 'Pokemon Card 151 Japanese Booster Box', 'box', 'JP', allowOfficial, allowRetail);
    assert.equal(result.status, 'gemini-http-429');
    assert.equal(result.errorCategory, 'unspecified-429');
    assert.equal(result.retryAfterSeconds, null);
  } finally { globalThis.fetch = saved; }
});
