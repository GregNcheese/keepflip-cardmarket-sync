# Keep & Flip 2.21.11 — ontbrekende Cardmarket-sets (TEST)

Deze branch is gebaseerd op `test/universal-card-index-2219` en wijzigt `main` niet. De officiële dagelijkse Cardmarket-prijsgids blijft ongemoeid. **Er wordt geen GitHub Pages-site bijgewerkt.**

## Wat doet deze aanvullende bron?

De TCGdex-kaartindex bevat voor sommige sets wel een setnaam maar geen kaartrecords. Een voorbeeld is het Japanse **CP6 / Expansion Pack 20th Anniversary**.

In plaats van per kaart een hardcoded uitzondering toe te voegen, gebruikt `scripts/build_cardmarket_set_fallbacks.py` een onafhankelijk gecontroleerde **anker-product-ID** om de officiële `idExpansion` uit de Cardmarket-singlesexport te bepalen. Daarna haalt het script **alle producten uit precies die officiële uitbreiding** op.

Bronnen voor het CP6-anker:
- Cardmarket Ninetales CP6 015/087: https://www.cardmarket.com/en/Pokemon/Products/Singles/Expansion-Pack-20th-Anniversary/Ninetales
- Product-ID ter kruiscontrole: https://cardstand.app/pokemon/expansion-pack-20th-anniversary/ninetales-015

## Echt gecontroleerd — 16 november 2026

- **Ninetales:** product-ID `562471`, officiële naam `Ninetales [Lure | Fire Blast]`.
- **Ninetales BREAK:** product-ID `562472`, afzonderlijk product.
- **Cardmarket-set-ID:** `3989`.
- **Totaal:** `103` officiële productrecords voor deze uitbreiding.
- Vier offline tests geslaagd; GitHub Actions-bouw geslaagd.

## Wat verandert in de afzonderlijke HTML 2.21.11 TEST?

Bij een Cardmarket-singlelink zonder nummer die niet door TCGdex wordt herkend:
1. Haal de aanvullende, gecontroleerde setindex op van GitHub.
2. Vergelijk **setnaam / setslug** en **volledige kaartnaam**.
3. Vergelijk het product-ID bij een geladen lokale officiële Cardmarket-catalogus opnieuw met de officiële naam en `idExpansion`.
4. Toon een kandidaat met **Kaartnummer controleren**. Zonder volledig nummer volgt **geen automatische prijs**, ook niet wanneer de officiële product-ID is gevonden.
5. Toon bij die kandidaat een rechtstreekse link naar Cardmarket.

**Grenzen:** de officiële productexport bevat doorgaans geen gedetailleerde kaartnummers, uitvoeringen, First Edition, taal per artikel of gegarandeerde kaartafbeeldingen. De set is Japans volgens de gecontroleerde ankergegevens, maar een product-ID alleen bevestigt geen fysieke druk. Afbeelding en prijs worden nooit verzonnen. De HTML staat apart als TEST-bestand en maakt geen automatische voorraadwijzigingen.

## Nieuwe testbestanden

- `config/cardmarket_set_anchors.json`
- `scripts/build_cardmarket_set_fallbacks.py`
- `tests/test_cardmarket_set_fallbacks.py`
- `.github/workflows/missing-set-fallback-22111.yml`
- `test-data/universal-2219/cardmarket-set-fallbacks.json`

Toekomstige ontbrekende sets kunnen pas worden toegevoegd wanneer een betrouwbare anker-ID gevonden en door de officiële catalogus geverifieerd is. Dit is **geen** automatische universele dekking voor alle ontbrekende sets.

**Nog niet mergen.** Eerst gebruikerstests van de HTML en aanvullende controles op echte sets zonder nummers.
