import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { inferProductType, additionalCount, mergeCountEvidence, explicitCardLanguage } from '../src/autofill.js';

const base = 'https://late-smoke-2a21.chokorii.workers.dev';
const registry = 'https://raw.githubusercontent.com/GregNcheese/test/main/registry.json';
const origin = 'https://keepflip.example';
const productName = 'Scarlet Violet Paldean Fates Booster Bundle';
const officialUrl = 'https://www.pokemon.com/us/pokemon-tcg/product-gallery/scarlet-violet-paldean-fates-booster-bundle';
const originalFetch = globalThis.fetch;

function registryProduct(overrides = {}) {
  return {
    verified: true, productName, productType: 'bundle', sourceUrl: officialUrl,
    packCount: 6, cardsPerPack: 10, expansionSet: 'Paldean Fates',
    language: 'EN', cardmarketProductId: '987654',
    ...overrides
  };
}

async function lookup(product, registryRows, officialHtml, setRows = []) {
  const saved = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url === registry) return new Response(JSON.stringify({ products: registryRows }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
    if (url.includes('/sets')) return new Response(JSON.stringify(setRows), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
    if (url.startsWith('https://www.pokemon.com/') && officialHtml) {
      return new Response(officialHtml, {status: 200, headers: { 'content-type': 'text/html' }});
    }
    return new Response('Not found', { status: 404, headers: {'content-type':'text/html'} });
  };
  try {
    const request = new Request(base + '/lookup', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret',
        Origin: origin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(product)
    });
    const response = await worker.fetch(request, {
      APP_ORIGIN: origin, KEEPFLIP_ACCESS_TOKEN: 'test-secret',
      KEEPFLIP_REGISTRY_URL: registry
    });
    assert.equal(response.status, 200);
    return await response.json();
  } finally {
    globalThis.fetch = saved;
  }
}

test('recognizes sealed types but does not equate blisters with loose boosters', () => {
  assert.equal(inferProductType('Paldean Fates Booster Bundle'), 'bundle');
  assert.equal(inferProductType('Delta Reign Pokemon Center Elite Trainer Box'), 'etb');
  assert.equal(inferProductType('Booster Display Box'), 'box');
  assert.equal(inferProductType('Ultra-Premium Collection'), 'upc');
  assert.equal(inferProductType('Japanese Sleeved Booster Pack'), 'pack');
  assert.equal(inferProductType('3-Pack Blister'), null);
  assert.equal(inferProductType('Mystery Pokémon Box'), null);
});

test('reads Japanese and Korean package counts separately from card counts', () => {
  assert.equal(additionalCount('1BOX=30パック / 1パック=5枚', 'packs'), 30);
  assert.equal(additionalCount('1BOX=30パック / 1パック=5枚', 'cards'), 5);
  assert.equal(additionalCount('1박스=20팩 / 1팩=5장', 'packs'), 20);
  assert.equal(additionalCount('1박스=20팩 / 1팩=5장', 'cards'), 5);
  assert.equal(additionalCount('Includes six Pokémon TCG booster packs', 'packs'), 6);
  assert.equal(additionalCount('Each booster pack contains ten game cards', 'cards'), 10);
});

test('conflicting count evidence cannot be auto-verified', () => {
  assert.equal(mergeCountEvidence(6, 8), null);
  assert.equal(mergeCountEvidence(6, 6), 6);
  assert.equal(mergeCountEvidence(null, 6), 6);
});

test('autofills exactly matched verified registry fields and inferred type', async () => {
  const result = await lookup({productName, productType: 'other', cardmarketProductId: '987654'},
    [registryProduct()]);
  assert.equal(result.version, '2.1.6');
  assert.equal(result.productType, 'bundle');
  assert.equal(result.suggestedProductType, 'bundle');
  assert.equal(result.suggestedCount, 6);
  assert.equal(result.suggestedCardsPerPack, 10);
  assert.equal(result.suggestedSet, 'Paldean Fates');
  assert.equal(result.suggestedLanguage, 'EN');
  assert.equal(result.verifiedFields.boosters, true);
  assert.equal(result.verifiedFields.cardsPerPack, true);
  assert.equal(result.verifiedFields.productType, true);
  assert.equal(result.provisionalFields.productType, false);
  assert.equal(result.status, 'match');
});

test('conflicting official pack count clears verified registry pack count', async () => {
  const page = '<!doctype html><html><title>Scarlet Violet Paldean Fates Booster Bundle</title>' +
    '<h1>Scarlet Violet Paldean Fates Booster Bundle</h1>' +
    '<main>Includes 8 booster packs. Each booster pack contains 10 game cards.</main></html>';
  const result = await lookup({productName, productType:'bundle', cardmarketProductId:'987654'},
    [registryProduct({language:null})], page);
  assert.equal(result.suggestedCount, null);
  assert.equal(result.verifiedFields.boosters, false);
  assert.equal(result.fieldConfidence.boosters, 'conflict');
  assert.equal(result.suggestedCardsPerPack, 10);
  assert.equal(result.status, 'needs-review');
  assert.equal(result.confidence, 'conflict');
  assert.ok(result.diagnostics.conflicts.some(x => x.field === 'boosters'));
});

test('mismatched user product type is not silently replaced', async () => {
  const result = await lookup({productName, productType:'etb'}, [], null);
  assert.equal(result.status, 'needs-review');
  assert.equal(result.productType, 'etb');
  assert.equal(result.suggestedProductType, 'bundle');
  assert.deepEqual(result.diagnostics.typeMismatch, {supplied:'etb',detected:'bundle'});
  assert.equal(result.suggestedCount, null);
});

test('wrong or missing product ID in registry never matches a specific requested ID', async () => {
  const result = await lookup({productName, productType:'bundle', cardmarketProductId:'987654'},
    [registryProduct({cardmarketProductId:null})]);
  assert.equal(result.suggestedCount, null);
  assert.equal(result.verifiedFields.boosters, false);
});

test('single booster never acquires a meaningless boosters-per-package count', async () => {
  const item = { ...registryProduct({productType:'pack', productName:'Paldean Fates Booster Pack',packCount:1}) };
  const result = await lookup({productName:'Paldean Fates Booster Pack', productType:'pack'},
    [item]);
  assert.equal(result.productType, 'pack');
  assert.equal(result.suggestedCount, null);
  assert.equal(result.verifiedFields.boosters, false);
  assert.equal(result.missingFields.includes('boosters'), false);
  assert.equal(result.suggestedCardsPerPack, 10);
});

test('autofill language requires an explicit statement and disallows contradictions', () => {
  assert.equal(explicitCardLanguage('Card language: Japanese'), 'JP');
  assert.equal(explicitCardLanguage('Kaarttaal: Koreaans'), 'KR');
  assert.equal(explicitCardLanguage('言語：日本語'), 'JP');
  assert.equal(explicitCardLanguage('언어: 한국어'), 'KR');
  assert.equal(explicitCardLanguage('语言：简体中文'), 'ZH-CN');
  assert.equal(explicitCardLanguage('Product language: traditional chinese'), 'ZH-TW');
  assert.equal(explicitCardLanguage('Japanese Pokémon card sold by an English shop'), null);
  assert.equal(explicitCardLanguage('Card language: English. Card language: Japanese.'), null);
});

test('without a registry, extracts all four proven fields from exact official product page', async () => {
  const officialHtml = [
    '<!doctype html><html>',
    '<title>Scarlet Violet Paldean Fates Booster Bundle</title>',
    '<main><h1>Scarlet Violet Paldean Fates Booster Bundle</h1>',
    '<p>Includes 6 booster packs. Each booster pack contains 10 game cards.</p>',
    '<p>Card language: English</p></main></html>'
  ].join('');
  const result = await lookup(
    {productName, productType:'other'},
    [],
    officialHtml,
    [{ id:'sv4.5',name:'Paldean Fates' }]
  );
  assert.equal(result.suggestedProductType, 'bundle');
  assert.equal(result.suggestedCount, 6);
  assert.equal(result.suggestedCardsPerPack, 10);
  assert.equal(result.suggestedSet, 'Paldean Fates');
  assert.equal(result.suggestedLanguage, 'EN');
  assert.equal(result.verifiedFields.boosters, true);
  assert.equal(result.verifiedFields.cardsPerPack, true);
  assert.equal(result.verifiedFields.set, true);
  assert.equal(result.verifiedFields.language, true);
  assert.equal(result.status, 'match');
  assert.equal(result.requiresConfirmation, true);
});

test('when independent sources fail, counts are not invented', async () => {
  const result = await lookup({productName,productType:'other'},[],null);
  assert.equal(result.suggestedProductType,'bundle');
  assert.equal(result.suggestedCount,null);
  assert.equal(result.suggestedCardsPerPack,null);
  assert.equal(result.verifiedFields.boosters,false);
  assert.equal(result.verifiedFields.cardsPerPack,false);
  assert.equal(result.requiresConfirmation,true);
});
