# Keep & Flip 2.21.16 — telefoon/laptop + Cardmarket prijsupdates (TEST)

## Status 17 november 2026

- **Productie/main:** NIET aangepast. Bestaande app blijft lokaal werken.
- **Backend:** bestaande geïsoleerde Cloudflare-preview `test/cloudflare-worker-gemini-autofill-218` heeft nu `GET /sync/status`, `GET /sync/snapshot` en `POST /sync/snapshot`. Beveiligd met bestaand `KEEPFLIP_ACCESS_TOKEN`; Gemini/CardOS endpoints blijven werken.
- **D1-binding:** ontbreekt nog; Preview-healthcheck bevestigt `deviceSyncConfigured: false`. Er is nog geen cloudkopie van privécollectiegegevens geüpload.
- **App:** zelfstandig `Keep_and_Flip_2.21.16_Device_Sync_Prijzen_TEST.html` gebaseerd op 2.21.15. Open **Instellingen → Mijn collectie synchroniseren**.
- **Prijzen:** GitHub Cardmarket-prijzen zijn al dagelijks beschikbaar via `cardmarket-sync.yml`. Nieuwe testcode controleert inhoud, brondatum, bronbestand en SHA-256. Een mislukte uitgave laat de bestaande GitHub Pages-publicatie en bekende waardes intact. In app: standaard eerst eigen GitHub-manifest, daarna bestaande prijsspiegel/lokale cache.

## Eénmalige Cloudflare-stap (geen API-key of nieuw extern account)

1. Open Cloudflare → **Storage & databases → D1** → **Create database**. Kies bijv. `keepflip-sync-test` en bevestig.
2. Open Cloudflare → **Workers & Pages → late-smoke-2a21**. Gebruik bovenaan het keuzemenu naast **Production** om **test/cloudflare-worker-gemini-autofill-218** te kiezen.
3. Open voor die **bestaande test-Preview** **Settings → Bindings**, voeg **D1 database** toe met **Variable name `KF_SYNC_DB`** en selecteer de nieuwe `keepflip-sync-test`-database.
4. Controleer in de bestaande Preview op `/health` dat `deviceSyncConfigured` nu `true` is. **De Worker maakt de twee tabellen op de eerste syncaanvraag zelf aan**, zonder handmatige SQL-stap. De SQL-migratie staat ter referentie in `worker/migrations/0001_keepflip_sync.sql`.

Als het Dashboard deze D1-binding niet bij de Preview laat instellen, is het alternatief de non-secret database-UUID in `previews.d1_databases` onder Wrangler opnemen. Deel daarvoor NOOIT een API-token of andere secrets.

## Eerste synchronisatie

- Open 2.21.16 TEST op telefoon/laptop. Ga naar Instellingen → Mijn collectie synchroniseren.
- Vul het **bestaande Worker-toegangstoken** in, NIET de CardOS API-key. Token leeft alleen in **sessionStorage** en moet na een nieuwe browsersessie opnieuw worden ingevoerd.
- Kies op het apparaat met de **juiste complete collectie**: **Dit apparaat als eerste uploaden**.
- Kies op het tweede apparaat: **Cloud op dit apparaat herstellen**. Er wordt eerst automatisch een lokale JSON-back-up gedownload; daarna pas wordt de cloudkopie hersteld.
- Daarna worden lokale wijzigingen automatisch na een paar seconden geüpload, en nieuwere cloudversies bij focus/online/periodiek opgehaald, **mits lokale gegevens ongewijzigd zijn sinds vorige sync**.
- Als beide apparaten tegelijk wijzigden, verschijnt **CONFLICT** en doet Keep & Flip geen automatische overwrite of merge. Herstel/selecteer het gewenste exemplaar bewust. De bestaande D1-data blijft bewaard en de laatste 10 versies worden op de server tijdelijk als versleutelde snapshots bijgehouden.

## Veiligheid & beperkingen

- Persoonlijke data is vóór upload gecomprimeerd en met AES-256-GCM versleuteld; sleutel wordt via PBKDF2 afgeleid uit het bestaande Worker-toegangstoken. De Worker krijgt alleen versleutelde gegevens. Bij tokenrotatie is eerst opnieuw versleuteld uploaden/herstellen nodig: maak een JSON-back-up.
- Cloud-snapshot maximaal circa 1,5MB inclusief versleuteling. Geen voorraad-merge: snapshots en revision-CAS, niet granular realtime co-editing.
- **Geen echte tweerichtingssynchronisatie is getest**, want D1 ontbreekt. Alle server-tests gebruiken lokale D1-mocks; app-JavaScript is op syntaxis gecontroleerd. Testen van Cloudflare met één telefoon/laptop na D1-koppeling is nog nodig.
- Het `file://` TEST-document kan vragen om toestemming voor de bestaande Worker; CORS `Origin: null` is alleen in geïsoleerde test-Preview toegestaan. Geen bewaarde CardOS-secrets of persoonlijke administratie in GitHub.

## Tests

- GitHub Actions (offline): D1 CAS, dubbele apparaten, conflicten, auth/CORS, ontbrekende binding, ongeldige payload — geslaagd.
- GitHub Actions (Python): Cardmarket bronvalidatie, SHA-256, verouderde bronnen en plotselinge daling aantal records — geslaagd.
- Cloudflare: bestaande Preview-build en /health-check geslaagd, `deviceSyncConfigured: false` (bewust nog niet verbonden).
- De afzonderlijke nieuwe PR-preview van `test/keepflip-sync-and-prices` gaf via de openbare healthcheck HTTP 403; daarom is de `/sync`-backend tevens in de **bestaande, bereikbare 2.1.8 test-Preview** gezet. Geen productie-update.

## Branches

- Backend op bestaande test-Preview: `test/cloudflare-worker-gemini-autofill-218`
- Afzonderlijke prijsverbeteringen/tests: `test/keepflip-sync-and-prices`, draft PR #10 naar de bestaande testbranch.
- Main en productie 2.1.4 blijven ongewijzigd.
