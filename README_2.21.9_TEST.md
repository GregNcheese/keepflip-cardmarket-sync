# Keep & Flip 2.21.9 — Universele Kaartindex TEST

Deze testbranch is gebaseerd op de 2.21.8-identificatietestbranch en wijzigt **niet** `main`. De officiële Cardmarket-singlescatalogus en prijsgids worden niet vervangen.

## Wat is er toegevoegd?

- `scripts/build_universal_index.py`: verzamelt alle **beschikbare** TCGdex-set- en kaartoverzichten in vijf talen. De source van alle records is TCGdex v2.
- `tests/test_universal_index.py`: vijf offline regressietests voor taalvelden, kaartnummer, dubbele ID's, onbekende sets en veilige afbeelding-URL's.
- `.github/workflows/universal-index-2219.yml`: bouwt de index op GitHub, controleert inhoud, schrijft alleen naar deze **testbranch**, uploadt ook een Actions-artifact. **Geen GitHub Pages-deployment.**
- `test-data/universal-2219/universal-manifest.json` + vijf taalbestanden: machineleesbare kaartindex, beschikbaar als ruwe GitHub-bestanden.

## Echte testresultaten: 16 november 2026

| Taal | Kaarten | Sets |
|---|---:|---:|
| Engels | 23.912 | 221 |
| Japans | 13.156 | 204 |
| Koreaans | 239 | 95 |
| Chinees vereenvoudigd | 877 | 56 |
| Chinees traditioneel | 7.436 | 98 |
| **Totaal** | **45.620** | **674 setrecords** |

Dit zijn **records, geen unieke Pokémon-kaarten**. Sommige talen hebben slechts gedeeltelijke dekking (vooral Koreaans en vereenvoudigd Chinees). De index biedt kaartnamen/nummers, sets, talen en afbeeldingsbronnen; de bulkindex bevat niet voor iedere kaart een Cardmarket-ID.

## HTML 2.21.9 TEST

De aparte Keep & Flip HTML TEST-build is gebaseerd op **2.21.8.1** en leest de index uit deze testbranch. Als de GitHub-index ontbreekt, valt hij terug op TCGdex-livecatalogi.

- Bij het plakken van een Cardmarket-singlelink wordt set en nummer vergeleken met de betreffende talen.
- Pas daarna vraagt de app de **gedetailleerde kaart** op bij TCGdex om een mogelijke Cardmarket-ID te vinden.
- Een ID telt pas mee wanneer het product ook in de **officiële Cardmarket-singlesexport** staat en de naam klopt.
- Meerdere talen = de gebruiker kiest eerst een taal; een Japanse setcode geldt niet als sluitend taalbewijs.
- V1/V2, verschillende product-ID's en First Edition-filters blijven op controle.
- Bij een ID-/naamconflict wordt geen automatische prijs toegekend. Voorbeeld: Houndoom was onjuist gekoppeld aan Delcatty.
- De test wijzigt geen aankopen, voorraad of eerdere prijzen.

### Veilig uitproberen

1. Maak eerst een JSON-back-up in Keep & Flip.
2. Open de afzonderlijke **Keep & Flip 2.21.9 Universele Kaartindex TEST.html** (niet de hoofdversie).
3. Ga naar **Instellingen → Universele kaartindex**.
4. Plak een kaartlink. Kies eventueel een taal en druk **Zoek kaart**.
5. Bekijk de kaartkandidaten. **candidate** of **variant-review** is niet hetzelfde als een definitief bevestigde uitvoering.

### Niet doen

- Niet mergen naar `main` voordat er aanvullende gebruikerspraktijktests zijn geweest.
- Niet van deze TCGdex-resultaten afleiden dat alle Cardmarket-prijzen of foto's voor iedere taal en druk bevestigd zijn.
- Niet handmatig een Pages-deploy starten vanaf deze branch: dat zou de publieke data kunnen vervangen.

## Bronnen

- https://tcgdex.dev/reference/card
- https://tcgdex.dev/faq
- https://github.com/GregNcheese/keepflip-cardmarket-sync/tree/test/universal-card-index-2219/test-data/universal-2219

De HTML-app is een **los testbestand**. De testbranch bevat de server-side indexgenerator en de gegenereerde data, niet automatisch alle lokale HTML-broncode.
