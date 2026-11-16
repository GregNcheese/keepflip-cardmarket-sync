# Keep & Flip 2.21.12 TEST — Foto's, setdekking en ID-controles

Dit is een **geconsolideerde TEST-branch** op basis van:
1. \`test/cardmarket-identity-index-2218\`
2. \`test/universal-card-index-2219\`
3. \`test/missing-set-fallback-22111\`

De \`main\` branch blijft ongewijzigd. De publieke GitHub Pages-site is niet opnieuw uitgerold.

## Wat er is toegevoegd
- \`scripts/build_quality_audit.py\`: toetst zeven openbare probleemkaarten, hun TCGdex-afbeeldingen en kandidaat-Cardmarket-ID's tegen de officiële productcatalogus. Alleen een echt bereikbare WebP-afbeelding van het TCGdex-domein heet \`asset-verified\`.
- \`config/quality_watchlist.json\`: reproduceerbare regressiegevallen. Geen persoonsgegevens of private collectiegegevens.
- \`tests/test_quality_audit.py\`: zeven offline tests voor URL-veiligheid, bereikbaarheid, variantcontrole, verkeerde Cardmarket-ID, ontbrekende CP6-afbeelding en setdekking.
- \`.github/workflows/quality-images-22112.yml\`: bouwt de audit in GitHub Actions, commit alleen op deze testbranch en publiceert een downloadbaar Actions-artifact. **Geen Pages-deployment.**
- \`test-data/quality-22112/quality-audit.json\`: de actuele, leesbare controle van zeven voorbeeldkaarten.
- \`test-data/quality-22112/coverage-report.json\`: volledige dekking per TCGdex-taal, inclusief sets zonder kaartrecords en kaartrecords zonder afbeelding-URL.

## Live resultaten (16 november 2026)
GitHub Actions: **geslaagd**. 7 offline regressietests: **geslaagd**.

| Kaart | Afbeeldingscontrole | ID-controle |
|---|---|---|
| Jolteon ex, Japans | TCGdex-afbeelding bereikbaar | V1 controleren |
| Marshadow & Machamp GX, Japans | Geen TCGdex-afbeelding-URL | V1 controleren |
| Mega Sableye & Tyranitar GX, Japans | Geen TCGdex-afbeelding-URL | V1 controleren |
| Sylveon XY04, Engels | TCGdex-afbeelding bereikbaar | Productnaam klopt, exacte druk apart beoordelen |
| Team Magma's Houndoom, Engels | TCGdex-afbeelding bereikbaar | **Product-ID 275811 hoort bij Delcatty — blokkeren** |
| Altaria SV37, Engels | TCGdex-afbeelding bereikbaar | Geen Cardmarket-product-ID |
| Ninetales CP6, Japans | Geen TCGdex-kaartrecord of afbeelding | Cardmarket-ID 562471 via afzonderlijke gecontroleerde CP6-fallback |

De dekking van de **bestaande TCGdex-index**:
- Engels: 23.912 records, 4 sets zonder kaartrecords, 1.781 kaartrecords zonder foto-URL.
- Japans: 13.156 records, 83 sets zonder kaartrecords, 9.274 zonder foto-URL.
- Koreaans: 239 records, 92 sets zonder kaartrecords, 239 zonder foto-URL.
- Vereenvoudigd Chinees: 877 records, 48 sets zonder kaartrecords, 877 zonder foto-URL.
- Traditioneel Chinees: 7.436 records, 15 sets zonder kaartrecords, 5.290 zonder foto-URL.

**Belangrijk:** het gaat om ontbrekende TCGdex-dekking, niet om bewijs dat de betreffende Pokémon-kaarten niet bestaan. Dit is ook geen test van alle afbeeldingen op internet.

## HTML TEST 2.21.12
De losse \`Keep_and_Flip_2.21.12_Afbeeldingen_Broncontrole_TEST.html\` is lokaal gebaseerd op 2.21.11. Ze haalt de twee kwaliteitsrapporten automatisch op vanaf deze GitHub-testbranch, toont een dashboard onder **Instellingen → Afbeeldingen & broncontrole** en kan een door GitHub geverifieerde afbeelding als **tijdelijke preview** tonen als een zoekresultaat een ontbrekende of niet-gecontroleerde afbeelding heeft.

Een preview wordt alleen aangeboden voor exact dezelfde **TCGdex kaart-ID en taal**. Hij overschrijft nooit je opgeslagen foto's, Cardmarket-prijzen, inkoop, voorraad of verkoopgegevens.

### Browserregressie
Chromium heeft getest:
- GitHub-paneel en samenvatting zichtbaar.
- Bevestigde Sylveon-foto als preview in de zoekresultaten.
- Verkeerde Houndoom-product-ID nog steeds afgekeurd.
- Ninetales CP6 via bestaande fallback (kaartnummer blijft ter controle).
- Opslag is geïsoleerd van oudere testversies.

## Veiligheid en grenzen
- Variant V1/V2, reverse/holo en First Edition worden **niet** automatisch bevestigd door een afbeelding of een productnaam.
- Geen automatische voorraad- of prijsaanpassingen.
- Niet automatisch mergen of publiceren op Pages.
- GitHub controleert alleen de **zeven openbare testkaarten** op daadwerkelijke afbeeldingsbereikbaarheid; de overige kaarten worden in de dekkingsrapportage alleen op de aanwezigheid van een foto-URL gecontroleerd.
- Bij een onbereikbare GitHub-kwaliteitsbron blijft de bestaande kaartzoekfunctie werken.
- Voor kaartsets zonder gegevens zoeken we eerst betrouwbare bronnen; géén fictieve kaart-ID's of foto's.

## Testen
\`\`\`bash
python -m unittest discover -s tests -p test_quality_audit.py -v
python scripts/build_quality_audit.py
\`\`\`

Er is geen eBay-integratie toegevoegd. We wachten daarvoor op de aparte eBay Developer-goedkeuring.
