/**
 * Compatibility probe for additional public Pokémon product search.
 * Zero API keys, zero Gemini and no storage of product lists.
 */
const hosts = [
  {name:'TCGHOBBY Taiwan',origin:'https://www.tcghobby.com',paths:['/en-gb','/en','']},
  {name:'Card Cellar Taiwan',origin:'https://www.card-cellar.com',paths:['/en','']}
];
const queries=['traditional chinese pokemon booster box','30th celebration booster box','pokemon booster box'];
for(const host of hosts){
  let gotResults=false;
  for(const path of host.paths){
    const u=new URL(path+'/search/suggest.json',host.origin);
    u.searchParams.set('q',queries[0]);u.searchParams.set('resources[type]','product');
    u.searchParams.set('resources[limit]','10');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch(u,{signal:controller.signal,redirect:'manual',
        headers:{Accept:'application/json'}});
      const type=response.headers.get('content-type')||'';
      let data=null;
      if(response.ok&&type.includes('json'))data=await response.json();
      const products=data?.resources?.results?.products;
      console.log('SOURCE_PROBE '+JSON.stringify({
        host:host.name,locale:path,status:response.status,contentType:type,
        productCount:Array.isArray(products)?products.length:null,
        first:Array.isArray(products)?products.slice(0,3).map(x=>({
          title:String(x?.title||'').slice(0,100),url:String(x?.url||'').slice(0,250)
        })):[]
      }));
      if(Array.isArray(products)){
        gotResults=true;
        const p=products.find(x=>/traditional|chinese|30th/i.test(String(x?.title)))||products[0];
        if(p?.url){
          const original=new URL(p.url,host.origin);
          const m=original.pathname.match(/\/products\/([a-z0-9-]+)/i);
          if(m){
            const productURL=new URL('/products/'+m[1]+'.js',host.origin);
            const info=await fetch(productURL,{headers:{Accept:'application/json'},redirect:'manual'});
            const contentType=info.headers.get('content-type')||'';
            const json=info.ok?await info.json().catch(()=>({})):null;
            const desc=String(json?.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
            console.log('PRODUCT_PROBE '+JSON.stringify({
              host:host.name,status:info.status,contentType,productURL:productURL.href,
              productTitle:String(json?.title||'').slice(0,100),
              descriptionLength:desc.length,
              hasPackCount:/\bbox\s*[:=]\s*\d{1,3}\s*packs|\b\d{1,3}\s*(?:booster\s*)?packs\b/i.test(desc),
              hasCardsPerPack:/\bpack\s*[:=]\s*\d{1,2}\s*cards|\b\d{1,2}\s*cards\s*(?:per|\/)\s*pack/i.test(desc)
            }));
          }
        }
      }
    }catch(e){
      console.log('SOURCE_PROBE '+JSON.stringify({host:host.name,locale:path,status:'unreachable',error:String(e?.name||'request failed')}));
    }finally{clearTimeout(timer);}
    if(gotResults)break;
  }
}
