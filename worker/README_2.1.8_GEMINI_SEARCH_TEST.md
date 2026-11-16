# Keep & Flip Worker 2.1.8 — Gemini Google Search AUTOFILL TEST

**GitHub testbranch:** `test/cloudflare-worker-gemini-autofill-218`  
**Productie:** bestaande Worker 2.1.4 blijft ongewijzigd. **Niet mergen en niet productiedeployen** zonder uitdrukkelijke goedkeuring.

## Productherkenning

Wanneer er **geen exact gecontroleerd productrecord** is, werkt de Worker als volgt:

1. Productnaam, type, gevraagde taal en eventuele gekende bron-URL controleren. Er worden géén voorraadaantallen, kostprijzen, klantgegevens of andere Keep & Flip-inventarisgegevens naar Gemini gestuurd.
2. Als `ENABLE_GOOGLE_SEARCH=true` **én** `GEMINI_API_KEY` beschikbaar is, één `generateContent`-aanvraag met Google Search uitvoeren via Gemini 3.5 Flash-Lite (of expliciet ingesteld model). Gemini zoekt kandidaatlinks naar de correcte productuitvoering in EN/JA/KO/ZH-CN/ZH-TW.
3. De kandidaat-URL's worden nooit direct als bewijs gezien. De Worker valideert toegestane officiële of retailerhosts, **haalt pagina's zelf op**, controleert de producttitel, type en editie (o.a. gewone vs Pokémon Center ETB), en leest booster-/kaartaantallen alleen uit de productbeschrijving.
4. TCGdex controleert setnamen onafhankelijk van Gemini. De bestaande, strenge `applyField`-conflictcontrole blijft van kracht; een volledig ongeldig of strijdig antwoord wordt nooit als verifieerde autofill gepresenteerd.
5. Bevestigde waarde + bronvermelding in de bestaande `suggestedCount`, `suggestedCardsPerPack`, `suggestedSet`, `suggestedLanguage`. Ontbrekende/onzekere informatie blijft voorlopig of `null`.
6. Het bestaande `searchSuggestionsHtml`-veld geeft de door Google's grounding tool geretourneerde Search Suggestions door. **De consumer-HTML moet deze Google-suggesties volgens de API-voorwaarden tonen wanneer het veld is gevuld.**

## Geen fictieve database

Het kleine test-productregister is optioneel en dient slechts als gecertificeerde snelle match. Voor nieuwe producten zoekt Gemini zelfstandig zodra de preview aanstaat en een Secret beschikbaar is; het register hoeft **niet** met alle Pokémon-producten te worden gevuld.

## Kosten en veiligheid

- **Per `/lookup` maximaal één Google Search-grounding API-aanvraag** in het nieuwe discoverypad. Gemini kan binnen die ene aanvraag meerdere betaalde zoekqueries uitvoeren. Google berekent bij Gemini 3-modellen kosten per uitgevoerde query. Raadpleeg de actuele Gemini API-prijzen en je projectlimieten voordat je grootschalig scannend gebruik toestaat.
- Als een gecontroleerde officiële productpagina onvolledig is, kan de reeds bestaande URL-context-verificatiefunctie nog een **aparte** Gemini-aanvraag doen. Dit is **geen tweede Google Search**.
- Google Search krijgt geen toegang tot opgeslagen Keep & Flip-inventaris.
- Geen API-sleutels of tokens in GitHub, Workflows of HTML.
- De Cloudflare **2.1.8-preview** heeft `ENABLE_GOOGLE_SEARCH=true` als publieke instelling, maar nog geen `GEMINI_API_KEY`. Zonder Secret doet hij **geen** Gemini-aanvragen. Dit is expres een configuratiegrens.
- Google Search / URL-context-resultaten zijn niet te vertrouwen zonder echte, geverifieerde brondata: Gemini-links zijn aanwijzingen, geen feiten.

## Eenmalige Secret die niet via GitHub kan worden overgezet

Cloudflare Previews **erven geen Secrets van Production** en Cloudflare onthult bestaande Secret-waarden niet. Voor de eerste live Gemini-test moet de gebruiker zelf onder **Settings → Variables and Secrets** een geldig `GEMINI_API_KEY` als **Secret** toevoegen aan **Previews Base** (of de bestaande 2.1.8-preview). De sleutel nooit in chat delen.

Volgens de Cloudflare-documentatie krijgen alleen **nieuwe** previews de naderhand toegevoegde Base-Secrets; op een bestaande preview kan een Secret rechtstreeks worden toegevoegd, of er kan een nieuwe GitHub-branch-preview worden gemaakt. De bestaande productie-Gemini-koppeling blijft ongewijzigd.

## Regressiechecks

`npm test`, `npm run check`, `npm run check:cloudflare` (geen deployment).
De offline tests gebruiken nagebootste Gemini-Search metadata en lokale HTML: geen echte API-sleutels en geen kosten. De publieke Cloudflare-`/health`-check meldt de preview-versie, toegangstoken, registry en Google-Search-toggles zonder het Secret zelf.

**Openstaand:** end-to-end `POST /lookup` met echte Gemini-resultaten vereist de preview-API-sleutel en passende frontend-test. Bewaak tokengebruik en API-facturering.
