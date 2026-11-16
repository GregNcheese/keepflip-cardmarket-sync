/**
 * Keep & Flip Gemini Testlab — only used on the isolated 2.1.8 preview branch.
 * No persistent tokens, no automatic paid lookups, and no inventory writes.
 */
export function renderTestLab() {
  return String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Keep & Flip · Gemini Testlab 2.1.8</title>
<style>
:root{color-scheme:dark;--bg:#0d1424;--surface:#172238;--surface2:#1f2e47;--line:#35445f;--text:#f3f6fd;--muted:#a5b5d0;--aqua:#72e4d4;--amber:#ffd18b;--rose:#ff9fa5}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top left,#1e3150 0%,var(--bg) 55%);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--text);min-height:100vh}
main{max-width:1140px;margin:auto;padding:24px 20px 60px}header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
.eyebrow{color:var(--aqua);font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(26px,3vw,36px);margin:3px 0 7px;line-height:1.15}h2{font-size:17px;margin:0 0 14px}h3{font-size:14px;margin:0 0 8px}
p{margin:0 0 12px;color:var(--muted)}.tag,.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-size:12px;font-weight:750;white-space:nowrap}.tag{color:var(--aqua)}
.pill.ok{color:#83f1ce;border-color:#3a796a;background:#163a36}.pill.warn{color:var(--amber);border-color:#786244;background:#3a3024}.pill.bad{color:var(--rose);border-color:#7c4a53;background:#40242e}
.panel{background:rgba(23,34,56,.96);border:1px solid var(--line);border-radius:17px;padding:21px;box-shadow:0 12px 30px rgba(0,0,0,.13)}
.layout{display:grid;grid-template-columns:minmax(290px,385px) minmax(0,1fr);gap:18px;align-items:start}.stack{display:grid;gap:18px}
label{display:block;color:#d9e4f5;font-size:13px;font-weight:700;margin-bottom:6px}.field{margin-bottom:14px}
input,select,button{font:inherit}input,select{width:100%;border-radius:9px;border:1px solid #485a77;background:#0e1a2e;color:#fff;min-height:42px;padding:10px 11px}input:focus,select:focus,button:focus-visible{outline:2px solid var(--aqua);outline-offset:2px}input::placeholder{color:#758ba8}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
button{cursor:pointer;border:0;border-radius:10px;padding:11px 14px;background:var(--aqua);color:#11232f;font-weight:800}button.secondary{border:1px solid #4c5f7c;background:var(--surface2);color:var(--text)}button:disabled{opacity:.55;cursor:wait}
.hint,.fine{font-size:12px;color:var(--muted)}.fine{margin:9px 0 0}.small{font-size:13px}.headline{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:9px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{border-radius:12px;border:1px solid #34445f;background:#112035;padding:13px;min-width:0}
.metric .value{font-size:22px;font-weight:850;overflow-wrap:anywhere;margin:4px 0}.metric .label{font-size:12px;color:var(--muted)}.metric .verify{font-size:12px}
.detail{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.source{padding:10px 0;border-top:1px solid #33425c}.source:first-child{border-top:0}
a{color:#91e8ff;overflow-wrap:anywhere}.source .small{color:var(--muted)}summary{cursor:pointer;font-weight:700;padding:7px 0}.pre{padding:12px;background:#0b1628;color:#bed2ed;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,Consolas,monospace;max-height:370px;overflow:auto;border-radius:8px}
#notice{white-space:pre-wrap;overflow-wrap:anywhere}#notice:empty{display:none}#result{display:none}.muted{color:var(--muted)}.separator{height:1px;background:var(--line);margin:15px 0}#suggestions{border:1px solid var(--line);width:100%;min-height:70px;border-radius:10px;background:white}
@media(max-width:830px){.layout{grid-template-columns:1fr}main{padding:16px 12px 40px}header{flex-wrap:wrap}.panel{padding:16px}}@media(max-width:460px){.two{grid-template-columns:1fr}.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<header><div><div class="eyebrow">Keep & Flip · geïsoleerde testomgeving</div><h1>Gemini Testlab</h1><p>Controleer Google Search, productinhoud en bronbewijzen voordat we autofill koppelen aan de app.</p></div><span class="tag">Worker 2.1.8 TEST</span></header>
<div class="layout">
  <div class="stack">
    <section class="panel">
      <h2>1 · Verbinding</h2>
      <div class="headline"><span id="health" class="pill warn">Controleren…</span><span id="version" class="small muted"></span></div>
      <p class="small">De toegangstoken wordt alleen voor je aanvraag gebruikt en nergens opgeslagen. Vul hem niet in op een andere website.</p>
      <div class="field"><label for="token">KEEPFLIP_ACCESS_TOKEN</label><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Plak de toegangstoken van deze preview"></div>
      <div class="actions"><button id="toggle" type="button" class="secondary">Toon token</button><button type="button" id="refresh" class="secondary">Controleer verbinding</button></div>
    </section>
    <section class="panel">
      <h2>2 · Producttest</h2>
      <form id="lookupForm">
        <div class="field"><label for="preset">Voorbeeld kiezen</label><select id="preset">
          <option value="">Zelf invullen</option>
          <option data-name="Scarlet &amp; Violet Paldean Fates Booster Bundle" data-type="bundle" data-language="EN" selected>Paldean Fates · Booster Bundle (EN)</option>
          <option data-name="Scarlet &amp; Violet Paldean Fates Elite Trainer Box" data-type="etb" data-language="EN">Paldean Fates · gewone ETB (EN)</option>
          <option data-name="Scarlet &amp; Violet Paldean Fates Pokemon Center Elite Trainer Box" data-type="etb" data-language="EN">Paldean Fates · Pokémon Center ETB (EN)</option>
          <option data-name="Pokemon Card 151 Japanese Booster Box" data-type="box" data-language="JP">Pokémon Card 151 · Booster Box (JP)</option>
          <option data-name="Pokemon Card 151 Korean Booster Box" data-type="box" data-language="KR">Pokémon Card 151 · Booster Box (KR)</option>
          <option data-name="Pokemon TCG Simplified Chinese Gem Pack Vol 1 Booster Box" data-type="box" data-language="ZH-CN">Gem Pack Vol. 1 · Box (ZH-CN)</option>
        </select></div>
        <div class="field"><label for="productName">Exacte productnaam</label><input id="productName" maxlength="150" required></div>
        <div class="two">
          <div class="field"><label for="productType">Verpakking</label><select id="productType"><option value="pack">Losse booster</option><option value="bundle">Bundle</option><option value="etb">Elite Trainer Box</option><option value="box">Booster Box</option><option value="upc">UPC / Collection</option><option value="other">Overig</option></select></div>
          <div class="field"><label for="language">Taal (optioneel)</label><select id="language"><option value="">Onbekend</option><option value="EN">Engels</option><option value="JP">Japans</option><option value="KR">Koreaans</option><option value="ZH-CN">Chinees · vereenvoudigd</option><option value="ZH-TW">Chinees · traditioneel</option></select></div>
        </div>
        <div class="actions"><button type="submit" id="run">Start één zoektest</button></div>
        <p class="fine">Er wordt niets aan je collectie toegevoegd. Eén zoektest kan Gemini Search-kosten veroorzaken. Geen automatische batchtests.</p>
      </form>
    </section>
  </div>
  <div class="stack">
    <section class="panel"><div class="headline"><h2 style="margin:0">3 · Resultaat</h2><span id="runStatus" class="pill">Nog niet getest</span></div>
      <p id="notice">Vul je previewtoken in en start één zoektest. Je ziet daarna precies wat bevestigd, voorlopig of onbekend is.</p>
      <div id="result">
        <div class="headline"><strong id="resultName"></strong><span id="resultStatus" class="pill"></span></div>
        <p id="summary" class="small"></p>
        <div id="metrics" class="grid"></div>
        <div class="detail"><h3>Google Search / broncontrole</h3><div id="discovery" class="small"></div></div>
        <div class="detail"><h3>Gevonden bronnen</h3><div id="sources"></div></div>
        <div id="suggestionsWrap" class="detail" hidden><h3>Google Search-suggesties</h3><iframe id="suggestions" title="Google Search-suggesties" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe></div>
        <div class="detail"><details><summary>Technische details (zonder toegangstoken)</summary><div class="actions" style="margin:8px 0"><button id="copy" class="secondary" type="button">Kopieer JSON</button></div><pre id="raw" class="pre"></pre></details></div>
      </div>
    </section>
    <section class="panel"><h2>Wat telt als betrouwbaar?</h2><p class="small">Een veld is alleen <strong style="color:#83f1ce">bevestigd</strong> wanneer de Worker er gecontroleerd bewijs voor heeft. Een voorstel op basis van de naam is <strong style="color:#ffd18b">voorlopig</strong>. Ontbrekende informatie wordt niet verzonnen.</p><p class="small" style="margin:0">Let op: \`groundingUsed: true\` laat zien dat Google Search-resultaten zijn gebruikt, niet dat alle productvelden kloppen.</p></section>
  </div>
</div>
</main>
<script>
(function(){
  'use strict';
  var $ = function(id){return document.getElementById(id);};
  var lastResult=null, running=false;
  function setPill(node,text,state){node.textContent=text;node.className='pill'+(state?' '+state:'');}
  function line(text){var p=document.createElement('p');p.textContent=text;p.className='small';return p;}
  function syncPreset(){
    var o=$('preset').selectedOptions[0];
    if(o && o.dataset.name){$('productName').value=o.dataset.name;$('productType').value=o.dataset.type;$('language').value=o.dataset.language;}
  }
  $('preset').addEventListener('change',syncPreset);
  syncPreset();
  $('toggle').addEventListener('click',function(){var t=$('token');t.type=t.type==='password'?'text':'password';$('toggle').textContent=t.type==='password'?'Toon token':'Verberg token';});
  async function health(){
    setPill($('health'),'Controleren…','warn');
    try{
      var r=await fetch('/health',{cache:'no-store',credentials:'omit'});
      if(!r.ok)throw Error('HTTP '+r.status);
      var data=await r.json();
      $('version').textContent='Versie '+(data.version||'?');
      if(data.version!=='2.1.8'){setPill($('health'),'Verkeerde Worker','bad');return;}
      if(!data.geminiConfigured || !data.googleSearchEnabled || !data.accessConfigured){setPill($('health'),'Configuratie onvolledig','warn');return;}
      setPill($('health'),'Online · Search klaar','ok');
    }catch(err){setPill($('health'),'Verbinding mislukt','bad');$('version').textContent=String(err.message||err);}
  }
  $('refresh').addEventListener('click',health);
  health();
  function fieldCard(label,value,verified,provisional){
    var div=document.createElement('div');div.className='metric';
    var l=document.createElement('div');l.className='label';l.textContent=label;div.appendChild(l);
    var v=document.createElement('div');v.className='value';v.textContent=(value===null||value===undefined||value==='')?'—':String(value);div.appendChild(v);
    var b=document.createElement('span');setPill(b,verified?'Bevestigd':provisional?'Voorlopig':'Niet bevestigd',verified?'ok':provisional?'warn':'bad');div.appendChild(b);
    return div;
  }
  function safeSource(url){
    try{var u=new URL(url);return (u.protocol==='https:' && !u.username && !u.password)?u.href:null;}catch(e){return null;}
  }
  function showResult(data){
    lastResult=data;$('result').style.display='block';$('notice').textContent='';
    $('resultName').textContent=data.productName||'Product';
    setPill($('resultStatus'),data.status||'needs-review',data.status==='match'?'ok':data.status==='partial'?'warn':'bad');
    $('summary').textContent=data.warning||'Controleer afzonderlijke velden en hun bronnen.';
    var m=$('metrics');m.replaceChildren();var verified=data.verifiedFields||{},provisional=data.provisionalFields||{};
    m.append(
      fieldCard('Aantal boosters',data.productType==='pack'?'Niet van toepassing':data.suggestedCount,verified.boosters,provisional.boosters),
      fieldCard('Kaarten per booster',data.suggestedCardsPerPack,verified.cardsPerPack,provisional.cardsPerPack),
      fieldCard('Set',data.suggestedSet,verified.set,provisional.set),
      fieldCard('Taal',data.suggestedLanguage,verified.language,provisional.language),
      fieldCard('Producttype',data.suggestedProductType||data.productType,verified.productType,provisional.productType)
    );
    var d=data.diagnostics&&data.diagnostics.googleDiscovery||{},box=$('discovery');box.replaceChildren();
    var used=data.groundingUsed===true?'Ja':'Nee';
    box.append(line('Google Search grounding: '+used+' · status: '+(d.status||'niet gerapporteerd')));
    box.append(line('Zoekqueries: '+(d.queryCount??'—')+' · officiële kandidaten: '+(d.officialCandidates??'—')+' · winkels: '+(d.retailerCandidates??'—')));
    box.append(line('Broninformatie bevestigd: '+(data.sourceVerified?'gedeeltelijk/volledig':'nee')+' · Gemini antwoord: '+(data.geminiResponded?'ja':'nee')));
    if (d.status==='gemini-http-429'){
      var categoryNames={
        'search-grounding-quota':'Google Search-groundinglimiet',
        'daily-quota':'dagelijkse API-limiet',
        'rate-limit':'tijdelijke aanvraaglimiet',
        'billing-or-spend-cap':'mogelijk betaal- of bestedingslimiet',
        'quota-or-rate-limit':'API-quota of aanvraaglimiet',
        'unspecified-429':'nog onbekende 429-oorzaak'
      };
      var explanation=categoryNames[d.errorCategory]||'nog onbekende 429-oorzaak';
      var retry=Number.isFinite(d.retryAfterSeconds)?
        ' · Google adviseert minimaal '+d.retryAfterSeconds+' seconden voor een nieuwe poging.':'';
      $('notice').textContent='Gemini Search is door Google afgewezen (HTTP 429: '+explanation+'). Dit is géén geslaagde Google-zoektest.'+retry;
      $('notice').style.color='var(--rose)';
      box.append(line('Gemini HTTP 429 · oorzaak: '+explanation+' · API-status: '+(d.errorStatus||'onbekend')));
      var a=document.createElement('a');a.href='https://aistudio.google.com/rate-limit';a.target='_blank';a.rel='noopener noreferrer';a.textContent='Controleer je Google AI Studio-limieten (inclusief Search grounding)';
      box.append(a);
    } else if(d.status&&String(d.status).startsWith('gemini-http-')){
      $('notice').textContent='Gemini-aanvraag mislukt: '+d.status+'. Andere bronnen kunnen wel informatie hebben opgeleverd.';
      $('notice').style.color='var(--amber)';
    } else {
      $('notice').style.color='';
    }
    var s=$('sources');s.replaceChildren();
    var sources=Array.isArray(data.sources)?data.sources:[];
    if(!sources.length)s.append(line('Geen gecontroleerde bronnen teruggegeven.'));
    sources.forEach(function(item){
      var div=document.createElement('div');div.className='source';
      var url=safeSource(item.url),a=url?document.createElement('a'):document.createElement('span');
      a.textContent=item.title||url||'Bron';if(url){a.href=url;a.target='_blank';a.rel='noopener noreferrer';}div.appendChild(a);
      var meta=document.createElement('div');meta.className='small';meta.textContent=(item.kind||'bron')+(url?' · '+new URL(url).hostname:'');div.appendChild(meta);s.appendChild(div);
    });
    var suggestions=typeof data.searchSuggestionsHtml==='string'?data.searchSuggestionsHtml:'';
    $('suggestionsWrap').hidden=!suggestions;
    if(suggestions)$('suggestions').srcdoc='<!doctype html><meta charset="utf-8"><style>body{font:13px sans-serif;padding:8px;color:#222}</style>'+suggestions;
    else $('suggestions').removeAttribute('srcdoc');
    $('raw').textContent=JSON.stringify(data,null,2);
  }
  $('copy').addEventListener('click',async function(){
    if(!lastResult)return;
    try{await navigator.clipboard.writeText(JSON.stringify(lastResult,null,2));$('copy').textContent='Gekopieerd';}
    catch(e){$('copy').textContent='Selecteer JSON om te kopiëren';}
  });
  $('lookupForm').addEventListener('submit',async function(e){
    e.preventDefault();if(running)return;
    var token=$('token').value.trim(),name=$('productName').value.trim();
    if(!token){$('notice').textContent='Vul eerst het toegangstoken van deze preview in.';return;}
    if(!name){$('notice').textContent='Vul een productnaam in.';return;}
    running=true;$('run').disabled=true;$('run').textContent='Zoeken…';$('result').style.display='none';
    setPill($('runStatus'),'Zoekopdracht loopt','warn');$('notice').textContent='Gemini en de productbronnen worden gecontroleerd. Er is één aanvraag gestart.';
    var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},55000);
    try{
      var data={productName:name,productType:$('productType').value};
      if($('language').value)data.language=$('language').value;
      var response=await fetch('/lookup',{
        method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'},
        credentials:'omit',cache:'no-store',signal:abort.signal,body:JSON.stringify(data)
      });
      var output=await response.json();
      if(!response.ok)throw Error('HTTP '+response.status+': '+(output.error||'Onbekende fout')+(response.status===401?' · Controleer welke previewtoken je gebruikt.':''));
      setPill($('runStatus'),'Aanvraag voltooid','ok');showResult(output);
    }catch(err){setPill($('runStatus'),'Aanvraag mislukt','bad');$('notice').textContent=err.name==='AbortError'?'De aanvraag duurde langer dan 55 seconden. Controleer de Worker-logs.':String(err.message||err);}
    finally{clearTimeout(timer);running=false;$('run').disabled=false;$('run').textContent='Start één zoektest';}
  });
})();
</script>
</body></html>`;
}
