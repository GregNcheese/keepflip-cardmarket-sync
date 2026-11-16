/**
 * CardOS Vision: paid fallback ONLY for a photo when regular OCR + catalog
 * yielded ZERO usable candidate cards. Uses existing Worker CardOS Secret.
 * Exact production API: https://service.rip.fun/api/v1/vision/identify
 * Never send keys, image bytes, source image or raw error bodies to client.
 */
const API='https://service.rip.fun/api/v1/vision/identify';
const MAX_BYTES=10*1024*1024;
const MAX_JSON=650000;
const IMAGE_HOSTS=new Set([
  'api.rip.fun','api.getcardos.com','service.rip.fun',
  'gjnrvwqtdlspyfpezgox.supabase.co'
]);
function safeImage(raw) {
  try {
    const u=new URL(raw);
    if(u.protocol==='https:' && IMAGE_HOSTS.has(u.hostname) &&
       !u.username && !u.password && !u.port)return u.href;
  }catch{}
  return null;
}
function num(raw,min,max) {
  return typeof raw==='number' && Number.isFinite(raw) &&
    raw>=min && raw<=max ? raw : null;
}
function short(raw,limit=150) {
  return typeof raw==='string'?raw.slice(0,limit):'';
}
function lang(v) {
  const n=short(v,40).toLowerCase();
  if(['en','english'].includes(n))return 'EN';
  if(['ja','jp','japanese'].includes(n))return 'JP';
  if(['ko','kr','korean'].includes(n))return 'KR';
  if(['zh-hans','zh-cn','simplified chinese'].includes(n))return 'ZH-CN';
  if(['zh-hant','zh-tw','traditional chinese'].includes(n))return 'ZH-TW';
  return null; // zh alone is ambiguous, NOT a known printing
}
function safeCandidate(row) {
  const card=row?.card;
  if(row?.game!=='pokemon' || !card || !card.id || !card.name)return null;
  const rawId=short(card.id,110);
  if(!/^[a-z0-9][a-z0-9_.-]{1,108}$/i.test(rawId))return null;
  const image=Array.isArray(card.images)
    ? card.images.find(x=>x?.type==='front')||card.images[0] : null;
  const number=short(card.printed_number || card.number,35);
  return {
    id:rawId,name:short(card.name,140),number,
    set:short(card.expansion?.name,120)||null,
    setId:short(card.expansion?.id,70)||null,
    language:lang(card.language_code || card.expansion?.language_code),
    rarity:short(card.rarity,85)||null,
    image:safeImage(image?.large || image?.medium || image?.small),
    confidence:num(row.confidence,0,1),
    variants:Array.isArray(card.variants) ? card.variants.slice(0,12)
      .map(v=>short(v?.name,50)).filter(Boolean) : []
  };
}
function safeResult(status,fields={}){return {status,...fields};}
function validatePhoto(data) {
  // Photos are never public URLs and never logged. A single-image data URI
  // avoids public hosting, anonymous image endpoints, SSRF and extra accounts.
  if(data?.action!=='fallback' ||
     data?.regularCandidateCount!==0 ||
     !['ocr-no-text','catalog-no-match'].includes(data?.reason))
    return null;
  const raw=data?.imageBase64;
  if(typeof raw!=='string'||raw.length>14_100_000)return null;
  const match=raw.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)return null;
  const payload=match[2];
  if(payload.length%4!==0)return null;
  const size=payload.length*3/4-(payload.endsWith('==')?2:payload.endsWith('=')?1:0);
  if(size<300 || size>MAX_BYTES)return null;
  return raw;
}

export async function identifyCardosVision(env,input) {
  if(!env?.CARDOS_API_KEY)return safeResult('not-configured');
  const photo=validatePhoto(input);
  if(!photo)return safeResult('not-eligible');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),58000);
  try {
    const response=await fetch(API,{
      method:'POST',redirect:'manual',signal:controller.signal,
      headers:{
        'X-API-Key':env.CARDOS_API_KEY,
        'Content-Type':'application/json',
        'Accept':'application/json'
      },
      body:JSON.stringify({image_base64:photo,game:'pokemon',limit:5}),
      cache:'no-store'
    });
    const rem=response.headers.get('x-credits-remaining');
    const cost=response.headers.get('x-credits-cost');
    const creditsRemaining=/^\d+$/.test(rem||'')?Number(rem):null;
    const creditsCost=/^\d+$/.test(cost||'')?Number(cost):null;
    const meta={creditsRemaining,creditsCost};
    if(!response.ok) {
      const status={
        401:'unauthorized',402:'out-of-credits',403:'forbidden',
        413:'image-too-large',429:'rate-limited',503:'unavailable',
        400:'bad-image'
      }[response.status] || (response.status>=500?'upstream-error':'http-error');
      return safeResult(status,meta);
    }
    if(!String(response.headers.get('content-type')||'').includes('json') ||
       Number(response.headers.get('content-length')||0)>MAX_JSON)
      return safeResult('unexpected-response',meta);
    const raw=await response.text();
    if(raw.length>MAX_JSON)return safeResult('oversize-response',meta);
    const json=JSON.parse(raw);
    if(json?.success!==true || typeof json?.data!=='object' || !json.data)
      return safeResult('invalid-response',meta);
    const body=json.data;
    const mapped=[];
    for(const row of Array.isArray(body.candidates)?body.candidates.slice(0,5):[]) {
      const card=safeCandidate(row);
      if(card && !mapped.some(x=>x.id===card.id))mapped.push(card);
    }
    const match=safeCandidate(body.match);
    if(match && !mapped.some(x=>x.id===match.id))mapped.unshift(match);
    const flagged=body.ambiguous===true;
    const exact=match && !flagged && match.confidence!==null &&
      match.confidence>=0.90 ? match.id : null;
    return safeResult(mapped.length?'suggestions':'no-match',{
      ...meta,
      source:'cardos-vision',
      candidates:mapped.slice(0,5),
      candidateCount:mapped.length,
      suggestedId:exact,
      ambiguous:flagged,
      reasons:Array.isArray(body.ambiguity_reasons)
        ?body.ambiguity_reasons.slice(0,5).map(x=>short(x,60)) : [],
      inputKind:short(body.input_kind,24)||'unknown'
      // Never auto-confirm or auto-write inventory from Vision.
    });
  }catch(e) {
    return safeResult(e?.name==='AbortError'?'timeout':'network-error');
  } finally {clearTimeout(timer);}
}
