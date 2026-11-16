import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  cardosUsage,cardosSearch,cardosGetProduct,discoverCardos,matchCardosProduct
} from '../src/cardos.js';

const base='https://test.example.workers.dev', key='fake-local-cardos-secret';
const item={
  id:'sv3pt5-1bb',name:'151 Booster Bundle',product_type:'bundle',
  language_code:'en',pack_count:6,cards_per_pack:10,
  expansion:{id:'sv3pt5',name:'151',language_code:'en'},
  images:[{type:'front',large:'https://api.rip.fun/storage/v1/object/public/tcg/products/151.png'}]
};
const headers={'Content-Type':'application/json','X-Credits-Remaining':'498','X-Credits-Cost':'1'};
function mockReply(data,status=200,add={}){
  return new Response(JSON.stringify(data),{status,headers:{...headers,...add}});
}
const env={CARDOS_API_KEY:key,DIRECT_WEB_DISCOVERY:'true',
 ENABLE_GOOGLE_SEARCH:'false',KEEPFLIP_ACCESS_TOKEN:'local-test-token',
 APP_ORIGIN:'https://gregncheese.github.io'};

test('missing CARDOS_API_KEY is safe and makes zero paid requests',async()=>{
  const original=globalThis.fetch;let called=false;
  globalThis.fetch=async()=>{called=true;throw Error('unexpected')};
  try{
    assert.equal((await discoverCardos({},'151 Booster Bundle','bundle','EN')).status,'not-configured');
    assert.equal((await cardosUsage({})).status,'not-configured');
    assert.equal(called,false);
  }finally{globalThis.fetch=original}
});
test('CardOS exact match rejects display cases, wrong printing, wrong category and wrong name',()=>{
  assert.equal(matchCardosProduct(item,'151 Booster Bundle','bundle','EN'),true);
  assert.equal(matchCardosProduct({...item,name:'151 Booster Bundle Display Case'},
    '151 Booster Bundle','bundle','EN'),false);
  assert.equal(matchCardosProduct({...item,language_code:'ja'},'151 Booster Bundle','bundle','EN'),false);
  assert.equal(matchCardosProduct({...item,product_type:'booster_box'},'151 Booster Bundle','bundle','EN'),false);
  assert.equal(matchCardosProduct({...item,name:'151 Elite Trainer Box'},'151 Booster Bundle','bundle','EN'),false);
});
test('CardOS searches service.rip.fun with X-API-Key only on server; fetches detail, credit headers, image',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(input,options)=>{
    const u=new URL(String(input));calls.push(u.href);
    assert.equal(u.hostname,'service.rip.fun');
    assert.equal(options.headers['X-API-Key'],key);
    assert.equal(options.method,'GET');
    assert.doesNotMatch(u.href,/fake-local-cardos-secret/);
    if(u.pathname==='/api/v1/pokemon/sealed'){
      assert.equal(u.searchParams.get('language'),'en');
      assert.equal(u.searchParams.get('q'),'name:151 product_type:bundle');
      return mockReply({success:true,data:[item]});
    }
    if(u.pathname==='/api/v1/pokemon/sealed/sv3pt5-1bb'){
      return mockReply({success:true,data:item});
    }
    throw Error('bad path '+u.pathname);
  };
  try{
    const value=await discoverCardos(env,'151 Booster Bundle','bundle','EN');
    assert.equal(value.status,'matched');
    assert.equal(value.product.packCount,6);
    assert.equal(value.product.cardsPerPack,10);
    assert.equal(value.product.language,'EN');
    assert.equal(value.product.productType,'bundle');
    assert.equal(value.product.image,item.images[0].large);
    assert.equal(value.product.set,'151');
    assert.equal(value.creditsRemaining,498);
    assert.equal(value.creditsCost,2);
    assert.equal(calls.length,2);
    assert.doesNotMatch(JSON.stringify(value),/fake-local-cardos-secret/);
  }finally{globalThis.fetch=original}
});
test('CardOS usage endpoint returns only sanitized balance, plan and usage',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(input,options)=>{
    assert.equal(new URL(String(input)).pathname,'/api/v1/account/usage');
    assert.equal(options.headers['X-API-Key'],key);
    return mockReply({success:true,data:{
      plan:'Pay as you go',balance_credits:377,credits_used_this_month:123,
      key:'this-cannot-leak',email:'private@example.com'
    }},200,{'X-Credits-Remaining':'377'});
  };
  try{
    const result=await cardosUsage(env);
    assert.equal(result.status,'ok');assert.equal(result.creditsRemaining,377);
    assert.equal(result.monthlyUsage,123);
    assert.doesNotMatch(JSON.stringify(result),/private@example.com|this-cannot-leak/);
  }finally{globalThis.fetch=original}
});
test('CardOS error responses sanitized; 402/401/403/429/5xx never expose returned body',async()=>{
  const original=globalThis.fetch;
  try{
    for(const [http,status] of [[401,'unauthorized'],[402,'out-of-credits'],[403,'forbidden'],[429,'rate-limited'],[500,'upstream-error']]){
      globalThis.fetch=async()=>mockReply({success:false,message:'SECRET PRIVATE BODY'},http);
      const result=await cardosSearch(env,'151 Booster Bundle','bundle','EN');
      assert.equal(result.status,status);
      assert.doesNotMatch(JSON.stringify(result),/SECRET PRIVATE BODY/);
    }
  }finally{globalThis.fetch=original}
});
test('CardOS rejects unsafe product IDs instead of allowing request to arbitrary paths',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('called')};
 try{
  const result=await cardosGetProduct(env,'../../secrets?key=abc');
  assert.equal(result.status,'invalid-id');assert.equal(calls,0);
 }finally{globalThis.fetch=original}
});
test('Worker integrates CardOS with same /lookup response and preserves Bearer-protected diagnostics',async()=>{
  const original=globalThis.fetch,requests=[];
  globalThis.fetch=async(input,options)=>{
    const url=String(input);requests.push(url);
    if(url.includes('/api/v1/pokemon/sealed/sv3pt5-1bb'))return mockReply({success:true,data:item});
    if(url.includes('/api/v1/pokemon/sealed'))return mockReply({success:true,data:[item]});
    if(url.includes('/api/v1/account/usage'))return mockReply({success:true,data:{balance_credits:498}});
    if(url.includes('api.tcgdex.net'))return new Response('[]',{
      headers:{'Content-Type':'application/json'}});
    return new Response('Not Found',{status:404});
  };
  try{
    let response=await worker.fetch(new Request(base+'/lookup',{
      method:'POST',headers:{Authorization:'Bearer local-test-token',
        Origin:base,'Content-Type':'application/json'},
      body:JSON.stringify({productName:'151 Booster Bundle',productType:'bundle',language:'EN'})
    }),env);
    const out=await response.json();
    assert.equal(response.status,200);
    assert.equal(out.suggestedCount,6);
    assert.equal(out.suggestedCardsPerPack,10);
    assert.equal(out.suggestedSet,'151');
    assert.equal(out.suggestedLanguage,'EN');
    assert.equal(out.verifiedFields.productType,true);
    assert.equal(out.verifiedFields.boosters,true);
    assert.equal(out.verifiedFields.cardsPerPack,true);
    assert.equal(out.diagnostics.cardos.status,'matched');
    assert.equal(out.cardos.product.image,item.images[0].large);
    assert.equal(out.status,'match');
    assert.equal(out.sources.some(x=>x.kind==='cardos-product'),true);
    assert.equal(requests.filter(x=>x.includes('/api/v1/pokemon/sealed')).length,2);
    assert.equal(requests.some(x=>x.includes('generativelanguage')),false);
    response=await worker.fetch(new Request(base+'/cardos/test',{
      method:'POST',headers:{Origin:base,Authorization:'Bearer local-test-token',
        'Content-Type':'application/json'},body:JSON.stringify({action:'usage'})
    }),env);
    assert.equal((await response.json()).creditsRemaining,498);
    assert.equal(response.status,200);
    const bad=await worker.fetch(new Request(base+'/cardos/test',{
      method:'POST',headers:{Origin:base,Authorization:'Bearer bad',
        'Content-Type':'application/json'},body:'{"action":"usage"}'
    }),env);
    assert.equal(bad.status,401);
    const cross=await worker.fetch(new Request(base+'/cardos/test',{
      method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer local-test-token',
        'Content-Type':'application/json'},body:'{"action":"usage"}'
    }),env);
    assert.equal(cross.status,403);
    const health=await worker.fetch(new Request(base+'/health'),env);
    assert.equal((await health.json()).cardosConfigured,true);
  }finally{globalThis.fetch=original}
});
test('Worker automatically falls back to existing sources when CardOS has no credits',async()=>{
  const original=globalThis.fetch;
  const page='https://rarecards.nl/en/products/pokemon-jp-151-booster-box';
  globalThis.fetch=async(input,options)=>{
    const url=String(input);
    if(url.includes('service.rip.fun'))return mockReply({error:'insufficient_credits'},402);
    if(url.includes('api.tcgdex.net'))return new Response('[]',{headers:{'Content-Type':'application/json'}});
    if(url.includes('/search/suggest.json')){
      const data=url.startsWith('https://rarecards.nl') ?
        [{title:'Pokémon (JP) 151: Booster Box',url:'/en/products/pokemon-jp-151-booster-box'}]:[];
      return mockReply({resources:{results:{products:data}}});
    }
    if(url===page)return new Response('<html><h1>Pokémon (JP) 151: Booster Box</h1>'+
      '<p>Number of boosters per box: 20 packs</p><p>Number of cards per pack: 7 cards</p>'+
      '<p>Language: Japanese</p></html>',{headers:{'Content-Type':'text/html'}});
    if(url.endsWith('/pokemon-jp-151-booster-box.js'))return mockReply({
      title:'Pokémon (JP) 151: Booster Box',
      description:'<p>Number of boosters per box: 20 packs</p><p>Number of cards per pack: 7 cards</p><p>Card language: Japanese.</p>'
    },200,{'Content-Type':'text/javascript'});
    return new Response('Not found',{status:404});
  };
  try{
    const response=await worker.fetch(new Request(base+'/lookup',{
      method:'POST',headers:{Authorization:'Bearer local-test-token',Origin:base,
        'Content-Type':'application/json'},
      body:JSON.stringify({productName:'Pokemon Card 151 Japanese Booster Box',productType:'box',language:'JP'})
    }),env);
    const out=await response.json();
    assert.equal(response.status,200);
    assert.equal(out.diagnostics.cardos.status,'out-of-credits');
    assert.equal(out.suggestedCount,20);
    assert.equal(out.suggestedCardsPerPack,7);
    assert.equal(out.verifiedFields.boosters,true);
    assert.equal(out.verifiedFields.cardsPerPack,true);
  }finally{globalThis.fetch=original}
});
