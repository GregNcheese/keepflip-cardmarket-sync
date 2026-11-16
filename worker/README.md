# Keep & Flip — Cloudflare Worker (2.1.4 GitHub TEST)

Dit is de **eerste import onder GitHub-versiebeheer**, gebaseerd op de eerder uit Cloudflare geplakte versie 2.1.4.

**Let op:** de oorspronkelijke bron is als Markdown geplakt. Daardoor moesten opmaak-escapes worden verwijderd voordat de code weer geldige JavaScript was. De code is syntactisch geldig en de offline route-/authenticatietests worden automatisch gedraaid, maar de inhoud is **nog niet byte-voor-byte vergeleken met de daadwerkelijke Cloudflare-deployment** (`7f96926b`). Deze branch is geen productie-uitrol.

## Bestanden

- `src/index.js`: gereconstrueerde Worker 2.1.4, routes `/`, `/health`, `/lookup`, `/image-lookup`, `/image`.
- `test/smoke.test.mjs`: offline basis- en toegangscontroles.
- `package.json`: uitsluitend `check` en `test`; bewust **geen** deploy-script.
- `.gitignore`: sluit secrets en lokaal gebouwde output uit.

## Beveiliging en deployment

De gekoppelde Cloudflare Worker heet `late-smoke-2a21`, en de productie-URL is `https://late-smoke-2a21.chokorii.workers.dev/`.

Volgens het dashboard is de ingestelde Cloudflare-productiebranch `main` in de repository `GregNcheese/keepflip-cardmarket-sync`. De gebruiker heeft **Disable builds** ingeschakeld. Wij hebben op deze testbranch **geen** `wrangler.toml` of auto-deploy toegevoegd.

Worker Secrets (uitsluitend Cloudflare, niet GitHub):
- `KEEPFLIP_ACCESS_TOKEN`
- `GEMINI_API_KEY`

Configuratievariabelen (afhankelijk van gebruik):
- `APP_ORIGIN`
- `KEEPFLIP_REGISTRY_URL`
- `GEMINI_MODEL`
- `ENABLE_GOOGLE_SEARCH`
- `SECONDARY_SOURCE_HOSTS`

**Geen tokens of API-sleutels in de broncode plaatsen.** Cloudflare Secret-waarden zijn hier niet geëxporteerd en mogen nooit worden gecommit.

## Vervolg

1. GitHub-tests groen laten worden en de bestaande routes vergelijken met de live 2.1.4-worker.
2. Kleine geïsoleerde functionele wijzigingen via een volgende testbranch en Pull Request.
3. Voor deployment eerst volledige bron-/configuratiecontrole en Cloudflare-buildinstellingen opnieuw beoordelen.
4. Productie pas aanpassen na expliciete toestemming.

De bestaande GitHub Pages Cardmarket-sync en de actieve Worker blijven ongemoeid.
