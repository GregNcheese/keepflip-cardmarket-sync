import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {identifyCardosVision} from '../src/cardos-vision.js';

const base='https://preview.example.workers.dev',secret='secret-local-only';
const env={
  CARDOS_API_KEY:secret,KEEPFLIP_ACCESS_TOKEN:'test-token',
  DIRECT_WEB_DISCOVERY:'true',ENABLE_GOOGLE_SEARCH:'false',
  APP_ORIGIN:'https://gregncheese.github.io'
};
const photo='data:image/jpeg;base64,'+Buffer.alloc(900,9).toString('base64');
const body={action:'fallback',reason:'catalog-no-match',
  regularCandidateCount:0,imageBase64:photo};
const card={
  id:'sv3pt5-151rh',name:'Mew ex',number:'151',printed_number:'151/165',
  language:'English',language_code:'en',rarity:'Double Rare',
  expansion:{id:'sv3pt5',name:'151',language_code:'en'},
  variants:[{name:'reverse holofoil'}],
  images:[{type:'front',small:'https://api.rip.fun/storage/v1/object/public/tcg/cards/sv3pt5/151.webp'}]
};
const header={'Content-Type':'application/json',
  'X-Credits-Cost':'5','X-Credits-Remaining':'490'};
function response(json,status=200){
  return new Response(JSON.stringify(json),{status,headers:header});
}
test('Vision refuses missing secret, nonzero ordinary results, no image and non-photo request without paying',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('must not call')};
  try {
    assert.equal((await identifyCardosVision({},body)).status,'not-configured');
    assert.equal((await identifyCardosVision(env,{...body,regularCandidateCount:1})).status,'not-eligible');
    assert.equal((await identifyCardosVision(env,{...body,imageBase64:''})).status,'not-eligible');
    assert.equal((await identifyCardosVision(env,{...body,action:'ordinary'})).status,'not-eligible');
    assert.equal(calls,0);
  }finally{globalThis.fetch=original}
});
test('Vision sends photo only once to CardOS server with Pokemon restriction and hidden API key',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opts)=>{
    calls++;
    assert.equal(String(url),'https://service.rip.fun/api/v1/vision/identify');
    assert.equal(opts.headers['X-API-Key'],secret);
    const payload=JSON.parse(opts.body);
    assert.equal(payload.game,'pokemon');
    assert.equal(payload.limit,5);
    assert.equal(payload.image_base64,photo);
    assert.equal(payload.image_url,undefined);
    return response({success:true,data:{
      match:{card,game:'pokemon',confidence:.97},
      ambiguous:false,candidates:[{card,game:'pokemon',confidence:.97}],
      feedback_id:'privatefeedback',input_kind:'raw_card'
    }});
  };
  try {
    const result=await identifyCardosVision(env,body);
    assert.equal(result.status,'suggestions');
    assert.equal(result.candidates.length,1);
    assert.equal(result.candidates[0].name,'Mew ex');
    assert.equal(result.candidates[0].number,'151/165');
    assert.equal(result.candidates[0].language,'EN');
    assert.equal(result.candidates[0].image,card.images[0].small);
    assert.equal(result.suggestedId,card.id);
    assert.equal(result.creditsRemaining,490);
    assert.equal(result.creditsCost,5);
    assert.equal(calls,1);
    assert.doesNotMatch(JSON.stringify(result),/secret-local-only|privatefeedback|data:image|base64/);
  }finally{globalThis.fetch=original}
});
test('Ambiguous vision candidates are returned for manual review, never automatically confirmed',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>response({success:true,data:{
    match:{card,game:'pokemon',confidence:.99},ambiguous:true,
    ambiguity_reasons:['printing_tie_unresolved'],
    candidates:[{card,game:'pokemon',confidence:.99}]
  }});
  try {
    const result=await identifyCardosVision(env,body);
    assert.equal(result.status,'suggestions');
    assert.equal(result.ambiguous,true);
    assert.equal(result.suggestedId,null);
    assert.deepEqual(result.reasons,['printing_tie_unresolved']);
  }finally{globalThis.fetch=original}
});
test('No-match is a billed 5-credit result; errors are sanitized',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>response({success:true,data:{match:null,candidates:[],ambiguous:false}});
    const miss=await identifyCardosVision(env,body);
    assert.equal(miss.status,'no-match');
    assert.equal(miss.creditsCost,5);
    for(const [code,status] of [[401,'unauthorized'],[402,'out-of-credits'],
        [403,'forbidden'],[429,'rate-limited'],[503,'unavailable'],[500,'upstream-error']]){
      globalThis.fetch=async()=>response({success:false,error:'private-server-error'},code);
      const error=await identifyCardosVision(env,body);
      assert.equal(error.status,status);
      assert.doesNotMatch(JSON.stringify(error),/private-server-error/);
    }
  }finally{globalThis.fetch=original}
});
test('Vision route stays protected, ordinary endpoints unchanged, file-origin preview still respects Bearer',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opts)=>{calls++;
    return response({success:true,data:{match:{card,game:'pokemon',confidence:.93},candidates:[]}});};
  const make=(token='test-token',origin=base,data=body)=>new Request(base+'/cardos/vision',{
    method:'POST',headers:{
      'Content-Type':'application/json',Authorization:'Bearer '+token,
      Origin:origin
    },body:JSON.stringify(data)});
  try {
    const unauthorized=await worker.fetch(make('wrong'),env);
    assert.equal(unauthorized.status,401);
    const cross=await worker.fetch(make('test-token','https://attacker.example'),env);
    assert.equal(cross.status,403);
    assert.equal(calls,0);
    const invalid=await worker.fetch(make('test-token',base,{...body,regularCandidateCount:2}),env);
    assert.equal(invalid.status,200);
    assert.equal((await invalid.json()).status,'not-eligible');
    assert.equal(calls,0);
    const ok=await worker.fetch(make(),env);
    assert.equal(ok.status,200);
    assert.equal((await ok.json()).status,'suggestions');
    assert.equal(calls,1);
    const health=await worker.fetch(new Request(base+'/health'),env);
    assert.equal((await health.json()).cardosVisionAvailable,true);
  }finally{globalThis.fetch=original}
});


test('CardOS Vision CORS preflight supports only authenticated test preview origins',async()=>{
  const req=origin=>new Request(base+'/cardos/vision',{
    method:'OPTIONS',
    headers:{Origin:origin,'Access-Control-Request-Method':'POST',
      'Access-Control-Request-Headers':'Authorization,Content-Type'}
  });
  const locked=await worker.fetch(req('null'),env);
  assert.equal(locked.status,403);
  const allowed=await worker.fetch(req('null'),{
    ...env,CARDOS_TEST_ALLOW_FILE_ORIGIN:'true'
  });
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'null');
  const denied=await worker.fetch(req('https://evil.example'),{
    ...env,CARDOS_TEST_ALLOW_FILE_ORIGIN:'true'
  });
  assert.equal(denied.status,403);
});

test('CardOS Vision enforces a larger but bounded photo payload without touching standard lookup limit',async()=>{
  const request=new Request(base+'/cardos/vision',{
    method:'POST',
    headers:{
      Authorization:'Bearer test-token',Origin:base,
      'Content-Type':'application/json','Content-Length':'14100001'
    },
    body:JSON.stringify(body)
  });
  const response=await worker.fetch(request,env);
  assert.equal(response.status,413);
});
