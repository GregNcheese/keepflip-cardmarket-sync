/**
 * Keep & Flip - CardOS sealed source (TEST).
 * The API key is read ONLY from Cloudflare env.CARDOS_API_KEY.
 * No CardOS authentication data or raw error bodies leave this module.
 * Production endpoint fixed to service.rip.fun; no user-supplied URLs.
 */
const BASE = 'https://service.rip.fun';
const PREFIX = '/api/v1/pokemon/sealed';
const LANGUAGE = Object.freeze({EN:'en',JP:'ja',KR:'ko','ZH-CN':'zh','ZH-TW':'zh'});
const TYPES = Object.freeze({
  pack:['booster_pack','sleeved_pack'], box:['booster_box'],
  bundle:['bundle'], etb:['elite_trainer_box'],
  upc:['ultra_premium_collection'], other:[
    'collection_box','special_box','tin','blister_pack',
    'three_pack_blister_pack','pack_art_bundle','other'
  ]
});
const NORMAL_TYPES=Object.freeze({
  booster_pack:'pack',sleeved_pack:'pack',booster_box:'box',
  booster_pack_case:'other',bundle:'bundle',
  elite_trainer_box:'etb',ultra_premium_collection:'upc',
  collection_box:'other',special_box:'other',tin:'other',
  blister_pack:'other',three_pack_blister_pack:'other',
  pack_art_bundle:'other',other:'other'
});
const STOP=new Set(['pokemon','pokémon','trading','card','cards','game','tcg',
 'booster','boosters','pack','packs','box','display','bundle','elite',
 'trainer','etb','ultra','premium','collection','sealed','english',
 'japanese','korean','chinese','traditional','simplified','scarlet',
 'violet','sword','shield','mega','evolution','series','set','sv','the',
 'and','edition','jp','kr','en','cn','zh']);
function clean(s) {
  return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function terms(s) { return clean(s).split(' ').filter(t=>t&&!STOP.has(t)); }
function boundedInt(value,max=100) {
  if(typeof value!=='number'||!Number.isInteger(value)||value<=0||value>max)return null;
  return value;
}
function safeImage(value) {
  try {
    const u=new URL(String(value||''));
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    if(!['api.rip.fun','api.getcardos.com','service.rip.fun',
      'gjnrvwqtdlspyfpezgox.supabase.co'].includes(u.hostname))return null;
    return u.href;
  }catch{return null;}
}
function languageOf(raw) {
  const v=clean(raw?.language_code || raw?.expansion?.language_code ||
    raw?.language || raw?.expansion?.language);
  if(['en','english'].includes(v))return 'EN';
  if(['ja','jp','japanese'].includes(v))return 'JP';
  if(['ko','kr','korean'].includes(v))return 'KR';
  if(['zh cn','zh hans','simplified chinese','chinese simplified'].includes(v))return 'ZH-CN';
  if(['zh tw','zh hant','traditional chinese','chinese traditional'].includes(v))return 'ZH-TW';
  // CardOS's "zh" alone cannot prove simplified vs traditional printing.
  return null;
}
function languageCompatible(obj,requested) {
  if(!requested)return true;
  const actual=languageOf(obj);
  if(actual)return requested===actual;
  const raw=clean(obj?.language_code || obj?.expansion?.language_code ||
    obj?.language || obj?.expansion?.language);
  // Chinese "zh" is an ambiguous language family. Do not auto-verify either.
  return !raw || (raw==='zh' && String(requested).startsWith('ZH-'));
}
function toType(value) {return NORMAL_TYPES[String(value||'')]||null;}
function editionCompatible(name,obj) {
  const n=clean(name),s=clean(obj?.name),both=n+' '+s;
  if(!s)return false;
  for(const label of ['pokemon center','no shrink','sleeved','display case','bulk case','sealed case','case','display','jumbo','slim']){
    // 'display' in 'booster display box' is a synonym of box; allow for those.
    if(label==='display' && /booster display box|display box/.test(both))continue;
    const expected=n.includes(label),actual=s.includes(label);
    if(expected!==actual)return false;
  }
  if(/\bcase\b/.test(s) && !/\bcase\b/.test(n))return false;
  return true;
}
export function matchCardosProduct(obj,name,type,requestedLanguage) {
  if(!obj||typeof obj!=='object'||!obj.id||!obj.name)return false;
  const actualType=String(obj.product_type||'');
  if(type!=='other' && !TYPES[type]?.includes(actualType))return false;
  const productTitle=clean(obj.name);
  // Structured product_type and human-readable product name must agree.
  // Providers can contain misclassified rows; never silently treat an ETB
  // as a booster bundle because it shares the same set name.
  if(type==='bundle' && !/\b(?:bundle|bundel)\b/.test(productTitle))return false;
  if(type==='etb' && !/(?:elite trainer box|trainerbox|\betb\b)/.test(productTitle))return false;
  if(type==='box' && !/(?:box|display|ボックス|박스)/.test(productTitle))return false;
  if(type==='upc' && !/(?:ultra premium|\bupc\b)/.test(productTitle))return false;
  if(type==='other' && TYPES.box.includes(actualType))return false;
  if(!languageCompatible(obj,requestedLanguage))return false;
  if(!editionCompatible(name,obj))return false;
  const need=[...new Set(terms(name))];
  const have=new Set([...terms(obj.name),...terms(obj.expansion?.name)]);
  if(!need.length || !need.every(w=>have.has(w)))return false;
  return true;
}
function createQuery(name,type) {
  const tokens=[...new Set(terms(name))].slice(0,3);
  if(!tokens.length)return '';
  // Quoted phrase is a substring in CardOS. Keep only a distinctive term
  // so English/Japanese/localized naming variants can still match.
  let q='name:'+tokens[0].replace(/[^a-z0-9]/g,'');
  const family={box:'booster_box',etb:'elite_trainer_box',
    bundle:'bundle',upc:'ultra_premium_collection'};
  if(family[type])q+=' product_type:'+family[type];
  return q;
}
function smallPublic(item){
  if(!item||typeof item!=='object')return null;
  const id=String(item.id||'');
  if(!/^[a-z0-9][a-z0-9_.-]{0,100}$/i.test(id))return null;
  return {
    id,name:String(item.name||'').slice(0,180),
    productType:toType(item.product_type),
    rawProductType:String(item.product_type||'').slice(0,50),
    set:String(item.expansion?.name||'').slice(0,110)||null,
    language:languageOf(item),
    languageRaw:String(item.language_code||item.expansion?.language_code||'').slice(0,12),
    packCount:boundedInt(item.pack_count),
    cardsPerPack:boundedInt(item.cards_per_pack,30),
    image:safeImage(item.images?.find?.(x=>x.type==='front')?.large ||
      item.images?.[0]?.medium || item.images?.[0]?.small)
  };
}
function result(status,extras={}){return {status, ...extras};}
async function call(env,path,query) {
  if(!env?.CARDOS_API_KEY)return result('not-configured');
  if(typeof env.CARDOS_API_KEY!=='string')return result('not-configured');
  const url=new URL(path,BASE);
  if(url.origin!==BASE || !url.pathname.startsWith('/api/v1/'))return result('invalid-path');
  for(const [k,v] of Object.entries(query||{})){
    if(v!==null&&v!==undefined&&v!=='')url.searchParams.set(k,String(v));
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try {
    const res=await fetch(url,{
      method:'GET',redirect:'manual',signal:controller.signal,
      headers:{'X-API-Key':env.CARDOS_API_KEY,Accept:'application/json'},
      cache:'no-store'
    });
    const creditsText=res.headers.get('x-credits-remaining');
    const costText=res.headers.get('x-credits-cost');
    const credits=/^\d{1,9}$/.test(creditsText||'')?Number(creditsText):null;
    const cost=/^\d{1,4}$/.test(costText||'')?Number(costText):null;
    const shared={httpStatus:res.status,creditsRemaining:credits,creditCost:cost};
    if(!res.ok){
      const state={400:'invalid-query',401:'unauthorized',402:'out-of-credits',
        403:'forbidden',404:'not-found',429:'rate-limited'}[res.status] ||
        (res.status>=500?'upstream-error':'http-error');
      return result(state,shared);
    }
    if(Number(res.headers.get('content-length')||0)>600000)return result('oversize',shared);
    if(!String(res.headers.get('content-type')||'').toLowerCase().includes('json'))
      return result('unexpected-content',shared);
    const raw=await res.text();
    if(raw.length>600000)return result('oversize',shared);
    const parsed=JSON.parse(raw);
    if(parsed?.success===false)return result('api-error',shared);
    return result('ok',{...shared,data:parsed?.data});
  } catch(e) {
    return result(e?.name==='AbortError'?'timeout':'network-error');
  } finally { clearTimeout(timer); }
}
export async function cardosUsage(env){
  const res=await call(env,'/api/v1/account/usage');
  if(res.status!=='ok')return {status:res.status,httpStatus:res.httpStatus||null,
    creditsRemaining:res.creditsRemaining??null};
  const data=res.data&&typeof res.data==='object'?res.data:{};
  const numbers=(...keys)=>{
    for(const key of keys){
      const v=data[key];
      if(Number.isSafeInteger(v)&&v>=0)return v;
    }
    return null;
  };
  return {status:'ok',httpStatus:res.httpStatus,
    creditsRemaining:numbers('balance_credits','credits_remaining','remaining_credits','credit_balance')??res.creditsRemaining??null,
    monthlyUsage:numbers('month_usage','credits_used_this_month','monthly_credits_used','usage_this_month'),
    plan:typeof data.plan==='string'?data.plan.slice(0,80):null};
}
export async function cardosGetProduct(env,id){
  if(!/^[a-z0-9][a-z0-9_.-]{0,100}$/i.test(String(id||'')))return result('invalid-id');
  const api=await call(env,PREFIX+'/'+encodeURIComponent(String(id)));
  if(api.status!=='ok')return api;
  const product=smallPublic(api.data);
  return product?result('ok',{product,creditsRemaining:api.creditsRemaining,
    creditCost:api.creditCost,httpStatus:api.httpStatus}):result('invalid-product',{
      creditsRemaining:api.creditsRemaining});
}
export async function cardosSearch(env,name,type='box',language='EN') {
  const q=createQuery(name,type);
  if(!q)return result('insufficient-name');
  const code=LANGUAGE[language] || 'all';
  const api=await call(env,PREFIX,{q,language:code,page_size:50});
  if(api.status!=='ok')return api;
  const all=Array.isArray(api.data)?api.data:[];
  const matched=all.filter(x=>matchCardosProduct(x,name,type,language));
  const uniq=[...new Map(matched.map(p=>[p.id,p])).values()];
  const safe=uniq.slice(0,8).map(smallPublic).filter(Boolean);
  if(uniq.length!==1)return result(uniq.length?'ambiguous':'no-match',{
    query:q,resultsScanned:all.length,candidates:safe,
    creditsRemaining:api.creditsRemaining,creditCost:api.creditCost
  });
  return result('matched',{query:q,resultsScanned:all.length,
    product:smallPublic(uniq[0]),creditsRemaining:api.creditsRemaining,
    creditCost:api.creditCost});
}
export async function discoverCardos(env,name,type,language){
  if(!env?.CARDOS_API_KEY)return result('not-configured');
  const search=await cardosSearch(env,name,type,language);
  if(search.status!=='matched')return search;
  const detail=await cardosGetProduct(env,search.product?.id);
  if(detail.status!=='ok')return result('detail-'+detail.status,{
    searchProduct:search.product,
    creditsRemaining:detail.creditsRemaining??search.creditsRemaining,
    candidates:[search.product]
  });
  // Search and detail must identify the same product and still match the user.
  if(detail.product.id!==search.product.id ||
    !matchCardosProduct({
      id:detail.product.id,name:detail.product.name,
      product_type:detail.product.rawProductType,
      language_code:detail.product.languageRaw,
      expansion:{name:detail.product.set,language_code:detail.product.languageRaw}
    },name,type,language))return result('detail-mismatch',{
      creditsRemaining:detail.creditsRemaining});
  const both=detail.product;
  return result('matched',{
    product:{...both,
      packCount:both.packCount??search.product.packCount,
      cardsPerPack:both.cardsPerPack??search.product.cardsPerPack,
      image:both.image??search.product.image,
      set:both.set??search.product.set},
    creditsRemaining:detail.creditsRemaining??search.creditsRemaining,
    creditsCost:(search.creditCost||0)+(detail.creditCost||0),
    searchResultCount:search.resultsScanned,
    source:'cardos'
  });
}
