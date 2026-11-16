# Keep & Flip Worker 2.1.7 — productidentiteit en autofill (TEST)

**Status:** GitHub-testbranch `test/cloudflare-worker-autofill-217`. **Geen productiedeployment of merge.**

Deze versie werkt door op de **2.1.6 AUTOFILL TEST** en behoudt de bestaande /lookup JSON-velden, /health, /image-lookup en /image.

## Waarom

In versie 2.1.6 bleven twee risicovolle paden over:

1. Het productregister gebruikte `.find()`: de **eerste** naam/alias kon ten onrechte worden bevestigd als meerdere varianten op dezelfde naam lijken.
2. De officiële bronparser kon de **gehele webpagina** lezen en aantallen uit 'Related Products' of footer oppikken. Meerdere geverifieerde officiële pagina's werden niet onderling gecontroleerd.

## Nieuw in 2.1.7

- **Varianten strenger onderscheiden:** Pokémon Center vs gewone ETB, 1st/2nd Edition, expliciet Japanse/Koreaanse/Engelse/Chinese uitvoeringen en Special Edition.
- **Dubbelen blijven onzeker:** exact overlappende bronrecords geven `diagnostics.registryStatus="ambiguous"` en maximaal vijf geanonimiseerde kandidaten (naam/type/ID/taal), maar geen willekeurige bevestigde aantallen.
- **Gerichte broncontrole:** alleen de productsectie na de H1; aangetoonde kop 'Related Products' e.d. stopt de extractie. Getallen uit die sectie tellen niet mee.
- **Alle exacte officiële bronnen controleren:** bij conflicterende boosts/kaarten/taal wordt het conflicterende veld weer `null` en het resultaat `needs-review`.
- **Veilige identiteitsselectie:** exacte Cardmarket-ID als gevraagd en optioneel exacte officiële bron-URL; ontbrekende ID of afgekeurde bron is geen bewijs.
- **Meertalige producttypen:** Japanse, Koreaanse en Chinese boosters en dozen, terwijl blisters en display-cases als onzeker worden gelaten.
- **Bestaande veiligheidsgrens:** wijzigingen raken geen voorraad, aankopen, verkopen, afbeeldingen, Secrets of productiesysteem.

## Tests

```sh
cd worker
npm install
npm run check
npm test
npm run check:cloudflare
```

GitHub Actions voert syntax, regressietests en Wrangler `--dry-run` uit zonder secrets of deployment.

## Nog niet opgelost

- Het openbare productregister bevat momenteel slechts een **kleine gecontroleerde starterslijst**; niet alle historische sealed producten.
- Voor officiële pagina's met onverwachte markup of niet-beschikbare brondata blijft een veld leeg en vraagt de Worker bevestiging.
- De huidige preview gebruikt geen Gemini-secret; een live Gemini-vergelijking is nog niet uitgevoerd.
- Er is nog geen end-to-end-test met de privé-POST /lookup op Cloudflare zelf gedaan; de tests gebruiken gecontroleerde nagebootste bronnen.

De actieve productie-Worker hoort op 2.1.4 te blijven totdat echte end-to-end tests én expliciete goedkeuring zijn afgerond.
