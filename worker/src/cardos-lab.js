/** Dedicated secure CardOS diagnostic page. No secrets in HTML. */
export function renderCardosLab(){return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Keep & Flip CardOS TEST</title><style>
:root{color-scheme:dark;font-family:system-ui,Arial}body{background:#0e1b2d;color:#edf2fa;margin:0}
main{max-width:880px;margin:auto;padding:22px}section{background:#192b40;padding:20px;margin:14px 0;border:1px solid #3c536d;border-radius:12px}
input,select{background:#0d1a2d;color:white;border:1px solid #567089;border-radius:7px;padding:11px;width:100%;box-sizing:border-box}
label{display:block;font-size:14px;margin:10px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
button{background:#2178bd;color:white;border:0;border-radius:7px;padding:12px;cursor:pointer;margin:6px}button:disabled{opacity:.5}
pre{background:#0a1727;white-space:pre-wrap;overflow-wrap:anywhere;max-height:390px;overflow:auto;padding:12px;border-radius:8px}
a{color:#9ad3ff}.muted{color:#acc0d4}.field{border-bottom:1px solid #344a5f;padding:7px 0;display:flex;justify-content:space-between}
img{max-width:220px;max-height:220px;object-fit:contain;background:#fff;border-radius:9px}
@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<p><a href="/testlab">Terug naar Worker Testlab</a></p><h1>CardOS — Sealed API TEST</h1>
<p class="muted">Vul alleen je bestaande Worker-toegangstoken in. De CardOS-sleutel blijft uitsluitend in Cloudflare en wordt nooit in dit scherm gevraagd of opgeslagen.</p>
<section><h2>1. Verificatie en credits</h2><p id="health">Worker controleren…</p>
<label>KEEPFLIP_ACCESS_TOKEN<input id="token" type="password" autocomplete="off" placeholder="Bestaande Worker-toegangstoken"></label>
<button id="usage">Sleutel + credits testen</button><p id="credits" class="muted">Nog niet opgevraagd</p></section>
<section><h2>2. Zoeken en detail</h2><div class="grid">
<label>Productnaam<input id="name" value="151 Booster Bundle"></label>
<label>Taal<select id="language"><option value="EN">Engels</option><option value="JP">Japans</option><option value="KR">Koreaans</option><option value="ZH-CN">Vereenvoudigd Chinees</option><option value="ZH-TW">Traditioneel Chinees</option></select></label>
<label>Type<select id="type"><option value="bundle">Bundle</option><option value="box">Boosterbox</option><option value="etb">ETB</option><option value="pack">Boosterpack</option><option value="upc">UPC</option><option value="other">Overig</option></select></label>
<label>CardOS product-ID<input id="id" placeholder="Na zoeken automatisch ingevuld"></label></div>
<button id="search">Zoek sealed (1 credit)</button><button id="get">Haal product op (1 credit)</button>
<button id="combined">Volledige /lookup + fallbacks</button>
<p class="muted">Er wordt geen collectievoorraad opgeslagen. De gecombineerde zoekactie kan twee credits kosten.</p></section>
<section><h2>3. Uitslag</h2><p id="summary" aria-live="polite">Nog geen test</p><div id="product"></div>
<details><summary>Technische gegevens, gesaneerd</summary><pre id="raw"></pre></details></section>
</main><script>
(function(){'use strict';var $=function(x){return document.getElementById(x)};
function field(name,value){var d=document.createElement('div');d.className='field';var a=document.createElement('span');a.textContent=name;
var b=document.createElement('b');b.textContent=value==null?'—':String(value);d.append(a,b);return d}
function display(data){$('raw').textContent=JSON.stringify(data,null,2);$('product').replaceChildren();
var p=data.product||data.cardos?.product;
if(p){if(p.image&&p.image.startsWith('https://')){var i=document.createElement('img');i.src=p.image;i.alt='Productfoto';i.referrerPolicy='no-referrer';$('product').append(i)}
[['Naam',p.name],['ID',p.id],['Taal',p.language],['Producttype',p.productType],['Set',p.set],['Boosters',p.packCount],['Kaarten/booster',p.cardsPerPack]]
.forEach(function(x){$('product').append(field(x[0],x[1]))});if(p.id)$('id').value=p.id}
if(data.cardos)[['Worker-status',data.status],['CardOS-status',data.diagnostics?.cardos?.status],['Boosters',data.suggestedCount],['Kaarten/booster',data.suggestedCardsPerPack]]
.forEach(function(x){$('product').append(field(x[0],x[1]))});
if(data.creditsRemaining!=null)$('credits').textContent=data.creditsRemaining+' credits over';
$('summary').textContent='CardOS-status: '+String(data.status||'?');}
async function run(action){var token=$('token').value.trim();if(!token){$('summary').textContent='Bestaande Worker-toegangstoken ontbreekt';return}
var data=action==='lookup'?{productName:$('name').value,productType:$('type').value,language:$('language').value}:
{action:action,productName:$('name').value,productType:$('type').value,language:$('language').value,productId:$('id').value.trim()};
['usage','search','get','combined'].forEach(function(x){$(x).disabled=true});$('summary').textContent='Bezig…';
var ctrl=new AbortController(),timer=setTimeout(function(){ctrl.abort()},35000);
try{var r=await fetch(action==='lookup'?'/lookup':'/cardos/test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
credentials:'omit',cache:'no-store',signal:ctrl.signal,body:JSON.stringify(data)});var json=await r.json();
if(!r.ok){$('summary').textContent='Worker HTTP '+r.status+': '+String(json.error||'onbekend');$('raw').textContent=JSON.stringify(json,null,2)}
else display(json)}catch(e){$('summary').textContent=e.name==='AbortError'?'Time-out':'Verbindingsfout'}finally{
clearTimeout(timer);['usage','search','get','combined'].forEach(function(x){$(x).disabled=false})}}
$('usage').onclick=function(){run('usage')};$('search').onclick=function(){run('search')};
$('get').onclick=function(){run('get')};$('combined').onclick=function(){run('lookup')};
fetch('/health',{cache:'no-store'}).then(function(r){return r.json()}).then(function(h){
$('health').textContent='Worker '+h.version+' · CardOS Secret '+(h.cardosConfigured?'ingesteld':'ontbreekt')+' · Gemini '+(h.geminiConfigured?'actief':'niet ingesteld')
}).catch(function(){$('health').textContent='Health niet bereikbaar'});
})();
</script></body></html>`;}
