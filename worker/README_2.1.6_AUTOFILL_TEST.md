# Keep & Flip Cloudflare Worker 2.1.6 AUTOFILL TEST

**Alleen GitHub-code en offline tests — geen Cloudflare-deployment.** Productie draait volgens de eerder gecontroleerde Cloudflare-deployment nog op 2.1.4.

## Doel

De bestaande `POST /lookup` slimmer én veiliger maken voor de afzonderlijke velden: **producttype, set, kaarttaal, boosters per verpakking en kaarten per booster**. `/health`, `/image-lookup` en `/image` blijven aanwezig, inclusief Bearer-autorisatie.

## Veranderingen

1. **Producttype uit de naam herkennen.** De Worker kan bij een onbekend type onderscheid maken tussen booster bundle, ETB, boosterbox, UPC en losse booster. Een naamherkenning is eerst een voorstel. Een conflicterend expliciet opgegeven type wordt niet stilzwijgend vervangen.
2. **Booster- en kaartinhoud gescheiden houden.** Extra patronen voor Engelstalige productzinnen en expliciete Japanse/Koreaanse verpakkingsnotaties, zoals `1BOX=30パック` en `1パック=5枚`. De bestaande parser blijft bestaan; een tegenspraak leidt tot geen automatische bevestiging.
3. **Losse booster zonder irrelevant doosveld.** Bij producttype `pack` wordt `suggestedCount` niet automatisch gevuld als 'boosters per verpakking'. Gekochte aantallen worden door de HTML/inkoopadministratie bijgehouden.
4. **Taal uitsluitend bij expliciet bewijs.** Kaarttaal kan uit een nadrukkelijke aanduiding in Engels, Nederlands, Japans, Koreaans of Chinees worden gelezen. De taal van de website of zoekresultaten wordt **nooit** gelijkgesteld aan de taal van de fysieke kaarten.
5. **Product-ID strikt.** Als de aanvraag een Cardmarket-product-ID bevat, moet een productregisterrecord dat ID zelf ook expliciet bevatten én exact matchen.
6. **Conflicten blokkeren.** Bij verschillende geverifieerde bronaantallen wordt het conflicterende veld op `null` gezet, `verifiedFields` teruggezet, en de tegenstrijdige voorstellen in `diagnostics.conflicts` bewaard. De Worker kan dat veld dan niet alsnog als bevestigd teruggeven.
7. **Bestaande JSON-interface behouden.** `suggestedCount`, `suggestedCardsPerPack`, `suggestedSet`, `suggestedLanguage`, `verifiedFields` en `provisionalFields` blijven. Nieuw: `suggestedProductType`, `fieldConfidence` (verified/provisional/conflict/missing). `requiresConfirmation` blijft `true`.

## Veilig testen

```sh
cd worker
npm run check
npm test
```

GitHub Actions draait dit op `test/cloudflare-worker-autofill-216`, zonder Cloudflare-token en zonder deploy-stap. De tests gebruiken gecontroleerde mocks, niet de live Gemini- of Cardmarket-API's.

### Grenzen en aandachtspunten

- Het bestaande productregister moet via `KEEPFLIP_REGISTRY_URL` zijn ingesteld om daarvan te kunnen autofillen. Dit stond bij de laatste Cloudflare-status nog niet geconfigureerd. Daarom is ook het pad **zonder productregister** getest: een exacte officiële productpagina plus TCGdex-setnaam kan voldoende bewijs leveren, maar niet voor elk product.
- Het resultaat is niet gegarandeerd volledig: onbekende producten blijven gedeeltelijk ingevuld in plaats van gegokt.
- De broncode van de basis 2.1.4 is eerder uit geplakte Markdown gereconstrueerd en **niet byte-identiek bewezen met de actieve Cloudflare-code**. Daarom niet rechtstreeks mergen/deployen voordat een Cloudflare-specifieke functionele controle is uitgevoerd.
- De Worker wijzigt **geen voorraad, inkoopprijzen, verkoopregistraties of afbeeldingen**. Hij geeft alleen voorstellen en broninformatie terug.
- Automatische Cloudflare-builds zijn volgens de gebruiker **uitgeschakeld**; niet inschakelen totdat de deploymentroute veilig is ingericht.
- Gemini-sleutels, toegangstokens en andere Secrets zijn niet toegevoegd aan GitHub.

## Testgevallen

- Paldean Fates Booster Bundle: boosters/kaarten per booster/set/taal met gecontroleerd productregister.
- Dezelfde bundle zonder productregister: velden uit een exacte officiële productpagina + TCGdex-setoverzicht.
- Tegenstrijdige aantallen: prijs-/voorraad-onafhankelijke voorstellen geblokkeerd.
- Producttype mismatch, ontbrekende bron, afwijkend Cardmarket-ID.
- Losse booster, ETB, boosterbox, UPC en blister onderscheid.
- Japanse, Koreaanse en Chinese expliciete inhouds- en taalvermeldingen.
- Bestaande `/health`, private `/lookup`, `/image-lookup`, `/image`, onbekende routes.

**Volgende fase:** na review gecontroleerde Cloudflare-preview of handmatige testdeployment; daarna pas eventueel live.
