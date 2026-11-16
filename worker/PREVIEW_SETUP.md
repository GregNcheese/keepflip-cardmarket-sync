# Cloudflare Preview: configuratiechecklist (alleen test)

**Worker:** `late-smoke-2a21`  
**GitHub repository:** `GregNcheese/keepflip-cardmarket-sync`  
**Te testen branch:** `test/cloudflare-worker-autofill-216`  
**Productie:** Worker versie **2.1.4** blijft actief. **Geen merge, geen automatische productiedeployment.**

## Wat al op GitHub is geregeld

- `worker/wrangler.jsonc` verwijst naar de bestaande Worker en `./src/index.js`.
- `previews` bevat alleen publieke configuratievelden: `APP_ORIGIN` (GitHub Pages browser-origin) en `ENABLE_GOOGLE_SEARCH=false`.
- `keep_vars=true` beschermt bestaande productie-dashboardvariabelen bij toekomstige deployments.
- `worker/package.json` vereist Wrangler 4.135+ voor Cloudflare Previews.
- GitHub Actions voert `node --check`, 15 offline tests, en `wrangler deploy --dry-run` uit. **Er wordt nooit vanaf GitHub Actions naar Cloudflare gedeployed.**

## Cloudflare dashboard — eerst veilig instellen

1. Open `late-smoke-2a21 → Settings → Builds → Production`.
   - **Disable builds: ON en opgeslagen.**
   - Production branch `main` blijft voorlopig ongewijzigd. `main` bevat nog geen Worker-deploymentconfiguratie.
   - Niet op `Deploy` klikken.
2. Open `Settings → Builds → Previews Base`.
   - **Builds for Preview branches: OFF** totdat onderstaande instellingen klaar zijn.
   - **Root directory: `worker`** (relatief aan repository-root, dus niet `/`).
   - **Build command:** `npm run check && npm test` (optioneel maar aanbevolen).
   - **Preview command:** `npx wrangler preview` (behouden).
   - Sla alle wijzigingen op.
3. Onder `Settings → Builds → Build watch paths`, indien beschikbaar:
   - **Include paths:** `worker/*`; Cloudflare's pattern `*` matcht ook geneste paden.
   - Hierdoor zullen toekomstige wijzigingen aan `scripts/` of `site/` de Worker niet bouwen.
4. **Previews Base Secrets**, onder `Settings → Variables and Secrets → Previews Base` (controleer de precieze menu-aanduidingen):
   - Voeg een **ander, sterk** geheim `KEEPFLIP_ACCESS_TOKEN` toe voor de preview (nooit in GitHub, chat of HTML/backup plakken). Zonder dit secret is `POST /lookup` terecht niet beschikbaar.
   - Optioneel later: `GEMINI_API_KEY` voor live Gemini-tests. De eerste tests kunnen met officiële pagina's en TCGdex, zonder Gemini.
   - De preview gebruikt niet automatisch productie-Secrets. Verander daarom niets aan de bestaande Production-variabelen of -Secrets.
5. Pas na controle:
   - **Builds for Preview branches: ON** (Cloudflare kan dan uit niet-productiebranches een geïsoleerde preview maken).
   - Test alleen de preview-URL, niet de productie-URL.
   - Cloudflare Previews zijn niet automatisch volledig privé; beveilig gevoelige endpoints en voorkom gevoelige gegevens in `GET /health`.

## Testproduct

```json
{
  "productName": "Scarlet Violet Paldean Fates Booster Bundle",
  "productType": "bundle"
}
```

Aanroepen met `POST /lookup`, header `Authorization: Bearer <PREVIEW_TOKEN>`, `Content-Type: application/json`, naar de **exacte** door Cloudflare getoonde preview-URL. Geen fictieve gegevens uit tests als echte cataloguswaarden presenteren. Gebruik het previewtoken alleen binnen je beveiligde testomgeving.

**Verschil:** een succesvolle GitHub dry-run valideert de build. Een echte Cloudflare Preview met geldige bronnen/Secrets blijft noodzakelijk voor een integratietest.
