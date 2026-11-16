# Keep & Flip 2.21.8 — Cardmarket identity sidecar (TEST)

Deze branch verandert **niet** de bestaande `scripts/build_data.py`: de officiële Cardmarket-product- en prijsgidsbestanden worden op dezelfde manier opgebouwd.

## Nieuw
- `scripts/build_card_identity.py`: controleert vijf geconfigureerde Pokémon-kaarten via TCGdex en toetst gevonden product-ID's aan de bestaande Cardmarket-singlesexport en prijsgids.
- `scripts/build_and_index.py`: voert eerst de vertrouwde sync uit en bouwt daarna een optionele `data/card-identity.json`. Mislukte identiteitscontrole mag de officiële prijsgidspublicatie niet blokkeren.
- `config/cardmarket_targets.json`: vijf voorbeeldlinks, setcodes en talen.
- `tests/test_card_identity.py`: vijf offline regressietests.
- De workflow draait eerst de tests en gebruikt daarna de nieuwe wrapper.

## Grenzen van deze proef
Dit is **geen volledige Pokémon-database**: alleen de vijf opgegeven links worden gecontroleerd. De officiële Cardmarket-export kan de setidentiteit onvoldoende detailleren. Een ID-match is daarom niet automatisch bewijs van de exacte editie of finish; `V1` blijft `variant-review`. De index geeft een **candidate** weer en hoort nog geen voorraadprijzen automatisch te overschrijven.

TCGdex kan informatie missen; een onbereikbare bron is geen bewijs dat de kaart niet bestaat. `card-identity.json` is een aanvullende diagnosebron, geen vervanging van de prijzen of bestaande collectiegegevens.

## Tests
```bash
python -m unittest discover -s tests -v
python scripts/build_and_index.py --refresh-catalog
```

De eerste opdracht is offline uitvoerbaar. De tweede gebruikt live Cardmarket- en TCGdex-bronnen en mag pas na review op een veilige testomgeving worden uitgevoerd. De bestaande GitHub Pages-publicatie kan bij een handmatige workflow-run op een testbranch de publieke Pages-site bijwerken: **niet uitvoeren voordat dat is afgestemd**.

## Volgende stap
Na het controleren van de live JSON volgt een afzonderlijke HTML TEST-build die de index uitleest. Deze branch verandert Keep & Flip zelf nog niet en uploadt nooit persoonlijke voorraaddata.
