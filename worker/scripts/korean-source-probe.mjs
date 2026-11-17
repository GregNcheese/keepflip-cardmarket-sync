/**
 * One-time zero-key discovery check: open Shopify product searches.
 * No customer data or token and no preloaded product catalog.
 */
const hosts = [
  {name:'Elemental Cards',host:'https://elemental.cards',locale:''},
  {name:'GC Hobby',host:'https://gchobby.com',locale:''},
  {name:'Pikamon',host:'https://pikamon.eu',locale:'en-eu'},
  {name:'Danireon',host:'https://www.danireon.com',locale:'en-us'},
  {name:'Card Binder',host:'https://card-binder.com',locale:''},
  {name:'MIR TCG',host:'https://mirtcg.com',locale:'en'}
];
for (const shop of hosts) {
  for (const search of ['151 korean booster box','151 korean']) {
    const u=new URL((shop.locale?'/'+shop.locale:'')+'/search/suggest.json',shop.host);
    u.searchParams.set('q',search);
    u.searchParams.set('resources[type]','product');
    u.searchParams.set('resources[limit]','10');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try {
      const r=await fetch(u,{signal:controller.signal,redirect:'manual',
        headers:{Accept:'application/json'}});
      const contentType=String(r.headers.get('content-type')||'');
      let results=null;
      if(r.ok&&contentType.includes('json')){
        const data=await r.json();
        results=Array.isArray(data?.resources?.results?.products)
          ?data.resources.results.products.map(p=>({title:p.title,url:p.url})):null;
      }
      console.log('KR_SHOP_PROBE '+JSON.stringify({
        shop:shop.name,host:shop.host,locale:shop.locale,search,
        http:r.status,contentType,items:results?.length??null,
        products:results?.slice(0,8)||[]
      }));
      if(results?.some(p=>/\b(?:korean|kor|kr)\b/i.test(p.title)&&/151/.test(p.title))) break;
    } catch(e){
      console.log('KR_SHOP_PROBE '+JSON.stringify({shop:shop.name,search,
        status:e?.name==='AbortError'?'timeout':'unreachable'}));
    } finally {clearTimeout(timer);}
  }
}
