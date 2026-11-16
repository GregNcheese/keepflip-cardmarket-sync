import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  editionTags, editionCompatible, matchingOfficialTitle,
  selectVerifiedProduct, scopedProductHtml
} from '../src/product-identity.js';
import { inferProductType } from '../src/autofill.js';

const normalize = value => String(value || '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\bpok[eé]mon(?:\s+(?:tcg|trading card game))?\b/g, ' ')
  .replace(/&/g, ' and ').replace(/\band\b/g,' ')
  .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, ' ')
  .replace(/\s+/g, ' ').trim();
const allowed = value => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['pokemon.com', 'www.pokemon.com'].includes(u.hostname) ? u.href : null;
  } catch { return null; }
};
const lang = value => value === 'EN' ? 'EN' : null;
const named = 'Scarlet Violet Paldean Fates Booster Bundle';
const source = 'https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-paldean-fates-booster-bundle';
const otherSource = 'https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-paldean-fates-booster-bundle?printing=other';
const fakeRegistryUrl = 'https://raw.githubusercontent.com/GregNcheese/example/main/registry.json';

function record(override = {}) {
  return {
    verified: true,
    productName: named,
    aliases: ['Paldean Fates Booster Bundle'],
    productType: 'bundle',
    sourceUrl: source,
    packCount: 6,
    cardsPerPack: 10,
    expansionSet: 'Paldean Fates',
    language: null,
    ...override
  };
}

async function fakeLookup(data, {records = [], official = {}, sets = []} = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url === fakeRegistryUrl) {
      return new Response(JSON.stringify({products: records}),
        {status:200,headers:{'content-type':'application/json'}});
    }
    if (url.includes('api.tcgdex.net/')) {
      return new Response(JSON.stringify(sets), {status:200,headers:{'content-type':'application/json'}});
    }
    if (Object.hasOwn(official,url)) {
      return new Response(official[url],{status:200,headers:{'content-type':'text/html'}});
    }
    return new Response('missing',{status:404,headers:{'content-type':'text/html'}});
  };
  try {
    const request = new Request('https://late-smoke-2a21.chokorii.workers.dev/lookup',{
      method:'POST',
      headers:{
        Authorization:'Bearer offline-test-secret',
        Origin:'https://keepflip.example',
        'Content-Type':'application/json'
      },
      body:JSON.stringify(data)
    });
    const response = await worker.fetch(request,{
      KEEPFLIP_ACCESS_TOKEN:'offline-test-secret',
      APP_ORIGIN:'https://keepflip.example',
      KEEPFLIP_REGISTRY_URL:fakeRegistryUrl,
      ENABLE_GOOGLE_SEARCH:'false'
    });
    assert.equal(response.status,200);
    return response.json();
  } finally {
    globalThis.fetch = original;
  }
}

function productPage(packs, extras = '') {
  return '<html><body><main><h1>' + named + '</h1>' +
    '<p>Includes ' + packs + ' booster packs.</p>' +
    '<p>Each booster pack contains 10 game cards. Card language: English.</p>' +
    extras + '</main></body></html>';
}

test('Pokémon Center, first edition and card language qualifiers are not interchangeable', () => {
  assert.deepEqual(editionTags('Paldean Fates Pokémon Center Elite Trainer Box'),['pokemon-center']);
  assert.equal(editionCompatible('Paldean Fates ETB','Paldean Fates Pokemon Center ETB'),false);
  assert.equal(editionCompatible('151 Booster Box Japanese','151 Booster Box Korean'),false);
  assert.equal(editionCompatible('151 Booster Box','151 Booster Box 1st Edition'),false);
  assert.equal(editionCompatible('Paldean Fates ETB','Paldean Fates ETB'),true);
  assert.equal(matchingOfficialTitle('Scarlet Violet Paldean Fates Pokemon Center Elite Trainer Box',
    'Scarlet Violet Paldean Fates Elite Trainer Box',normalize,inferProductType),false);
});

test('registry selects exactly one verified identity, never first of two ambiguous matches', () => {
  const result = selectVerifiedProduct([
    record({packCount:6,sourceUrl:source}),
    record({packCount:8,sourceUrl:otherSource})
  ],{name:named,type:'bundle',id:null,language:null},normalize,allowed,lang);
  assert.equal(result.status,'ambiguous');
  assert.equal(result.record,null);
  assert.equal(result.candidates.length,2);
  const selected = selectVerifiedProduct([
    record({packCount:6,sourceUrl:source}),
    record({packCount:8,sourceUrl:otherSource})
  ],{name:named,type:'bundle',id:null,language:null,sourceUrl:source},normalize,allowed,lang);
  assert.equal(selected.status,'exact');
  assert.equal(selected.record.packCount,6);
});

test('registry rejects alias missing edition qualifier, unverified rows and mismatched ID', () => {
  const pc = record({
    productName:'Scarlet Violet Paldean Fates Pokemon Center Elite Trainer Box',
    aliases:['Paldean Fates ETB'],
    productType:'etb',packCount:11
  });
  assert.equal(selectVerifiedProduct([pc],
    {name:'Paldean Fates ETB',type:'etb'},normalize,allowed,lang).status,'not-found');
  assert.equal(selectVerifiedProduct([record({verified:false})],
    {name:named,type:'bundle'},normalize,allowed,lang).status,'not-found');
  assert.equal(selectVerifiedProduct([record()],
    {name:named,type:'bundle',id:'123'},normalize,allowed,lang).status,'not-found');
});

test('scoped official content removes cross-sell booster counts', async () => {
  const page = productPage(6,'<h2>Related Products</h2><p>Includes 8 booster packs. 7 cards per booster.</p>');
  assert.doesNotMatch(scopedProductHtml(page),/Includes 8 booster packs/);
  const result = await fakeLookup({productName:named,productType:'bundle'},{
    official:{[source]:page},sets:[{name:'Paldean Fates',id:'sv4.5'}]
  });
  assert.equal(result.version,'2.1.7');
  assert.equal(result.suggestedCount,6);
  assert.equal(result.suggestedCardsPerPack,10);
  assert.equal(result.suggestedSet,'Paldean Fates');
  assert.equal(result.suggestedLanguage,'EN');
  assert.equal(result.status,'match');
});

test('an official Pokémon Center page cannot fill a regular ETB',async()=>{
  const normal='Scarlet Violet Paldean Fates Elite Trainer Box';
  const pcHtml='<h1>Scarlet Violet Paldean Fates Pokemon Center Elite Trainer Box</h1>'+
    '<p>Includes 11 booster packs.</p>';
  const result=await fakeLookup({productName:normal,productType:'etb',sourceUrl:source},{
    official:{[source]:pcHtml}
  });
  assert.equal(result.suggestedCount,null);
  assert.equal(result.verifiedFields.boosters,false);
  assert.equal(result.status,'needs-review');
});

test('conflicting exact official pages clear the count instead of silently trusting first', async()=>{
  const result=await fakeLookup({
    productName:named,productType:'bundle',sourceUrls:[source,otherSource]
  },{
    official:{[source]:productPage(6),[otherSource]:productPage(8)},
    sets:[{id:'sv4.5',name:'Paldean Fates'}]
  });
  assert.equal(result.suggestedCount,null);
  assert.equal(result.verifiedFields.boosters,false);
  assert.equal(result.fieldConfidence.boosters,'conflict');
  assert.equal(result.status,'needs-review');
  assert.ok(result.diagnostics.conflicts.some(c=>c.field==='boosters'));
});

test('ambiguous registry yields candidate identities, not invented exact autofill',async()=>{
  const result=await fakeLookup({productName:named,productType:'bundle'},{
    records:[record({packCount:6}),record({packCount:8,sourceUrl:otherSource})]
  });
  assert.equal(result.diagnostics.registryStatus,'ambiguous');
  assert.equal(result.diagnostics.registryCandidates.length,2);
  assert.equal(result.suggestedCount,null);
  assert.equal(result.status,'needs-review');
  assert.match(result.warning,/Meerdere uitvoeringen/);
  assert.equal(result.requiresConfirmation,true);
});
