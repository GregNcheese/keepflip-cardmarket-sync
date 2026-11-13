# Automatische Cardmarket-bron voor Keep & Flip 2.17.2 TEST

Deze GitHub Actions-workflow downloadt de **officiële Cardmarket Pokémon JSON-exporten**.
De dagelijkse prijsgids wordt elke run vernieuwd; de productcatalogi elke vrijdag,
bij de eerste run, of na handmatig `refresh_catalog` aanzetten.
De workflow controleert het formaat en publiceert alleen publiek beschikbare
product- en prijsgegevens; **je Keep & Flip-aankopen en verkopen worden nooit geüpload**.

## Eenmalig instellen

1. Maak op GitHub een nieuwe repository aan, bijvoorbeeld `keepflip-cardmarket-sync`.
2. Upload de **inhoud van deze map** (met de verborgen `.github`-map) naar de root van die repository.
   Het eenvoudigst kan dit via Git op de laptop. Let op: het gewone GitHub-uploadscherm toont verborgen mappen niet altijd duidelijk.
3. Open **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open **Actions → Keep & Flip - Cardmarket daily data sync → Run workflow**.
5. Na een geslaagde run vind je de gegevens op
   `https://JOUWGEBRUIKERSNAAM.github.io/keepflip-cardmarket-sync/data/manifest.json`
   (de repo-naam kan afwijken).
6. Open Keep & Flip **2.17.2 TEST → Instellingen → Automatische Cardmarket-sync**;
   plak het **volledige manifestadres** bij "Eigen GitHub Pages-bron".
   Klik **Synchronisatie-instellingen opslaan** en vervolgens **Nu synchroniseren**.

GitHub Pages voor een projectsite moet online bereikbaar zijn met CORS. Test op je
telefoon en laptop afzonderlijk: beide apparaten bewaren lokale cataloguscaches.
De workflow kan als geplande taak op GitHub vertraging oplopen. Het is geen
realtime prijsfeed. Controleer de bronupdate die de app toont.

## Wat gebeurt er automatisch?

- Bij openen controleert Keep & Flip hoogstens eens per 6 uur de online bron.
- Github Actions draait dagelijks rond 04:35 UTC (GitHub kan de uitvoering vertragen).
- Productcatalogi komen wekelijks uit de officiële bron, prijsstatistieken dagelijks.
- Ungewijzigde catalogi worden niet opnieuw gedownload door Keep & Flip.
- Grote JSON-catalogi blijven in de **IndexedDB browsercache** op dat apparaat.
- Gekoppelde prijzen worden alleen bijgewerkt bij een exact opgeslagen Cardmarket product-ID.
- Oude marktprijzen blijven bewaard wanneer de nieuwe bron ontbreekt of onvolledig is.
- Geen van je voorraad-, verkoop-, inkoop- of ripsessiedata gaat naar GitHub.

## Wat als je geen GitHub wilt instellen?

De HTML-app gebruikt uit zichzelf de al aanwezige **openbare prijsdataspiegel van een
externe partij** en werkt bij openen gekoppelde prijzen bij. Dit is geen eigen
hosting en heeft niet dezelfde garantie of catalogusdekking. Handmatige import van
de drie officiële JSON-bestanden blijft mogelijk. Na die import onthoudt de browser
ze, totdat je de opslag wist of een ander browserprofiel gebruikt.

## Veiligheid en beperkingen

- **Maak vóór een update een Keep & Flip JSON-back-up**. De browsercache van de
  Cardmarket-catalogus is geen back-up van je voorraad.
- Dit is **geen cloudsync van je persoonlijke administratie**: telefoon en laptop
  hebben nog elk een eigen lokale voorraad.
- Bij een naams- of variantconflict moet je de exacte kaart blijven bevestigen.
  De Cardmarket-catalogus bevat niet altijd kaartnummer of setnaam als leesbare tekst.
- Cardmarket geeft dagelijkse prijsgidsstatistieken, geen live aanbiedingen,
  en geen per-taal, per-conditie of per-land prijs.
- Controleer voor publieke herpublicatie van gegevens of dat past binnen de
  geldende gebruiksvoorwaarden van Cardmarket.
- Deze workflow heeft geen GitHub-secret of Cardmarket API-sleutel nodig.
