# Keep & Flip 2.21.13 TEST — Officiële Japanse foto's + lokale voorraadscan

Deze branch bouwt voort op `test/quality-images-22112`. `main` en de openbare GitHub Pages-prijssynchronisatie blijven ongewijzigd.

## Nieuw op GitHub
- `config/official_japanese_photo_sources.json`: drie kaartidentiteiten, kaartnummer, taal, officiële kaartpagina en originele bronfoto-URL.
- `scripts/verify_official_photo_sources.py`: controleert de officiële Japanse pagina op set/nummer en de oorspronkelijke JPEG op formaat en bereikbaarheid. **Downloadt geen complete foto's en host nooit afbeeldingsbestanden.** Alleen de bron-URL en verificatiestatus worden bewaard.
- `tests/test_official_photo_sources.py`: zeven offline veiligheids- en regressietests.
- `.github/workflows/official-photo-22113.yml`: draait de tests, controleert de bronpagina's en publiceert alleen `test-data/photo-22113/official-photo-fallbacks.json` op deze TEST-branch.

### Bevestigde officiële bronafbeeldingen (16 november 2026)
| Kaart | Japanse set | Nummer | Foto bevestigd |
| --- | --- | --- | --- |
| Marshadow & Machamp GX | SM10 Double Blaze | 042/095 | Ja |
| Mega Sableye & Tyranitar GX | SM11 Miracle Twin | 054/094 | Ja |
| Ninetales | CP6 Expansion Pack 20th Anniversary | 015/087 | Ja |

De drie officiële foto-URL's zijn in de GitHub Actions-run gecontroleerd op kaartpagina-identiteit en echte JPEG-respons. **Niet** bewezen: Cardmarket V1/V2, holo, First Edition, conditie of marktwaarde.

GitHub-run: https://github.com/GregNcheese/keepflip-cardmarket-sync/actions/runs/43835933933

## HTML 2.21.13 TEST (apart lokaal bestand)
De HTML is gebaseerd op **Keep & Flip 2.21.12 TEST** en gebruikt voortaan de nieuwe 2.21.13-bronbranch. Onder Instellingen staat **'Ontbrekende voorraadfoto’s'**:
- Scant uitsluitend ontbrekende foto's van kaartitems in de **lokale** voorraad; alle persoonlijke data blijven in de browser.
- Maximaal **40 kaartrecords per batch**, met knop **Volgende 40 kaarten** voor de rest.
- Zoekt in bestaande TCGdex-index plus officiële Japanse bronfallback.
- Toont de afbeeldingskandidaten met kaartnaam, bron en set/nummer, maar slaat **niets automatisch op**.
- De gebruiker selecteert per kaart maximaal één afbeelding en bevestigt **Bewaar geselecteerde foto’s**.
- Wijzigt uitsluitend `photoUrl` of `cm.imageUrl` van de betrokken voorraadregel. De code maakt eerst een volledige nieuwe JSON-kopie van de lokale administratie en vervangt deze in één localStorage-write, waarna **Ongedaan maken** de oude kopie kan herstellen zolang de app open blijft.
- Reeds opgeslagen foto's worden niet overschreven. Inkoop, verzendkosten, Cardmarket-ID, marktprijzen, hoeveelheden, verkopen en historische gebeurtenissen worden niet aangepast.
- Wanneer de officiële bron niet bereikbaar is, werkt de normale TCGdex-terugval nog steeds.
- Bij een nieuwe Cardmarket-link kan een officiële foto worden voorgesteld als de kaart-ID en taal overeenkomen. Het resultaat blijft `variant-review` of `needs-catalog` totdat de exacte uitvoering/prijs apart is bevestigd.

### Tests
- Zeven offline GitHub-regressietests geslaagd.
- GitHub Actions heeft drie echte officiële Japanse bronfoto's geverifieerd.
- Chromium: drie ontbrekende voorraadfoto's gevonden, twee expliciet geselecteerde foto's opgeslagen, niet-geselecteerde foto onaangetast, kostprijs en verzendkosten onveranderd, undo gelukt.
- Chromium: zoeken via Cardmarket-link koppelt alle drie officiële foto-URLs als preview.
- Chromium: 42 lokale kaarten gescand in twee batches (40 + 2).

**Beperkingen:** de officiële fotofallback omvat nu precies deze drie Japanse kaarten. Voor andere ontbrekende foto's gebruikt de inventarisscan de bestaande TCGdex-bron. De scan is geen volledige eigen image crawler, geen bewijs van exacte print en heeft geen eBay-koppeling. In sommige browsers kan de originele officiële site externe weergave blokkeren. Controleer de bronfoto vóór bevestiging. Gebruik eerst een JSON-back-up.

## Veiligheid
Alleen publieke kaartmetadata worden op GitHub verwerkt. De bestaande testbranches en `main` zijn niet overschreven. De HTML-app is een afzonderlijk testbestand en is niet op GitHub Pages gepubliceerd. Geen geautomatiseerde prijsupdates; geen afbeeldingsbestanden gekopieerd of gehost.
