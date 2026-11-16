# Keep & Flip Worker 2.1.8 — live productherkenning TEST

**Testbranch:** `test/cloudflare-worker-gemini-autofill-218`  
**PR:** https://github.com/GregNcheese/keepflip-cardmarket-sync/pull/9  
**Testlab:** https://test-cloudflare-worker-gemini-autofill-218-late-smoke-2a21.chokorii.workers.dev/testlab

**Productie:** Worker 2.1.4 en `main` blijven ongewijzigd. Draft PR niet mergen en niet naar productie uitrollen zonder uitdrukkelijke goedkeuring.

## Waarom

De gebruiker wil géén lijst met duizenden Pokémon-sets, sealed artikelen, booster-/kaartinhouden of een zelf bijgehouden Excelregister maken. Productgegevens worden daarom direct bij een zoekopdracht online opgehaald. De winkels beheren hun eigen catalogi; Keep & Flip slaat alleen door de gebruiker bevestigde collectie-invoer op.

## Direct online zoeken (gratis, geen nieuwe account)

Previewinstellingen:
- `DIRECT_WEB_DISCOVERY=true`
- `ENABLE_GOOGLE_SEARCH=false` (vermijdt Gemini Google Search-quota en betaalde grounding)
- Bestaande `GEMINI_API_KEY` en `KEEPFLIP_ACCESS_TOKEN` blijven in Cloudflare Secrets en worden niet in de repository opgeslagen.

Voor onbekende sealed producten:
1. Genereer zoektermen uit naam en producttype (dus niet uit een hardcoded productlijst).
2. Raadpleeg de *openbare Shopify Predictive Search API* op RareCards en CardNation. Toon maximaal 10 producttitels per winkelaanvraag; indien nodig één bredere zoekterm.
3. Keur kandidaten strikt op set, taal, producttype, variant, Pokémon Center-versie, bundle/display, sleeved en shrink-variant. Alleen HTTPS-productpagina's van toegestane hosts zijn toegestaan. Linkuitkomsten zijn slechts kandidaten.
4. Haal de echte productpagina op en controleer opnieuw de producttitel. De Shopify Ajax Product API `/products/{handle}.js` levert daarna de eigenlijke productbeschrijving; de Content-Type `text/javascript` is toegestaan omdat de body als JSON wordt geparseerd.
5. Lees boosters-per-verpakking, kaarten-per-booster en expliciet vermelde taal uit die beschrijving. Een aanbodstekst als `Aantal booster packs per box: 20 packs` is bruikbaar; een losse vermelding van een andere verpakking niet.
6. Vergelijk meerdere overeenkomende bronnen en maak conflicterende velden leeg. Geen voorgestelde of verzonnen aantallen presenteren als geverifieerd.
7. TCGdex controleert een exacte set indien beschikbaar. Wanneer de set niet exact kan worden geïdentificeerd, blijft die onbevestigd. Dat verhindert niet dat correct bevestigde packaantallen getoond worden.

Het eerder gebruikte kleine optionele testregister kan bestaan als snelle bron, maar hoeft niet te worden uitgebreid of onderhouden. De nieuwe online zoeklaag werkt zonder dit register.

## Bevestigd met echte HTTP-aanvragen (16 november 2026)

GitHub Actions met een lokaal nep-Bearertoken (géén user Secret en géén Gemini):
- `Pokemon Card 151 Japanese Booster Box` → RareCards, **20 boosters en 7 kaarten per booster** bevestigd.
- `Pokemon TCG Simplified Chinese Gem Pack Vol 1 Booster Box` → RareCards, **15 boosters en 4 kaarten per booster** bevestigd.
- `Scarlet & Violet Paldean Fates Booster Bundle` → CardNation en RareCards, **6 boosters en 10 kaarten per booster** bevestigd.

De online winkelzoekfuncties vonden 3 van 3 exacte kandidaten; de volledige Worker verifieerde ook 3 van 3 productinhouden. Deze drie tests bewijzen geen volledige wereldwijde dekking. Niet elke webshop gebruikt Shopify, niet elk artikel staat in de huidige winkels, en sommige oude productbeschrijvingen zijn onvolledig of onjuist.

## Testen en veiligheid

- Offline tests: `npm --prefix worker test`.
- Syntax en droge Cloudflare-build: `npm --prefix worker run check` en `npm --prefix worker run check:cloudflare`.
- GitHub Actions: `.github/workflows/cloudflare-worker-source-test.yml` heeft ook twee diagnostische live tests zonder secrets en zonder betaalde API.
- Preview-healthcheck verifieert `liveSearchEnabled=true` en `googleSearchEnabled=false`.
- Testlab toont bron-URL's, afzonderlijke veldbevestigingen, live providerstatus, Google Search uitgeschakeld en kopieerbare JSON.
- Het bestaande toegangs-Secret blijft vereist voor `POST /lookup`. De browser bewaart het niet permanent.
- Requests naar externe websites worden uitsluitend gedaan voor publieke productnaam, type en optionele taal. Geen aankopen, inkoopprijzen, klantdata of collectie-inhoud gaan naar winkels of Gemini.
- Bronnen niet gevonden, 404, 429, tegenstrijdige aantallen of onbereikbare pagina's mogen nooit gefabriceerde resultaten opleveren.

## Historische Gemini Search-code

De vorige `gemini-discovery.js` code blijft voor regressietests beschikbaar, maar draait **niet** wanneer `DIRECT_WEB_DISCOVERY=true`. Een betaalde Google-zoek-API, extra account, API-sleutel of handmatige productlijst is niet nodig voor deze huidige implementatie.

**Vervolg:** eerste echte browsersessie op het bestaande Testlab bevestigen, daarna optioneel meer publiek toegankelijke productbronnen toevoegen op basis van geteste zoekdekking.
