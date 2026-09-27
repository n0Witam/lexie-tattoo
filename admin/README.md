# Pracownia portfolio

Otwórz `/admin/reorder.html` przez serwer HTTP (lokalnie lub na GitHub Pages).
Panel jest statycznym edytorem: zmiany publikujesz przez podmianę `data/portfolio.json` w repozytorium.

## Trzy stałe grupy

Nazw ani kolejności głównych grup nie można zmieniać:

1. **Nowe** — zdjęcia wykryte przez runnera, jeszcze nieprzypisane do publicznej galerii. Nie pojawiają się w Portfolio, Wolnych wzorach ani w karuzeli. Przeniesienie istniejącej pracy do Nowych usuwa ją także z karuzeli.
2. **Wolne wzory** — dostępne projekty, widoczne na stronie Wolne wzory.
3. **Wykonane prace** — zdjęcia na stronie Portfolio. Mogą pozostać bez kategorii lub należeć do podkategorii.

Przycisk **+ Kategoria** wewnątrz Wykonanych prac tworzy podkategorię. Jej nazwę i kolejność możesz zmienić. Pustą kategorię można usunąć; aby usunąć niepustą, najpierw przenieś prace. Główne grupy są nieusuwalne. Podkategorie mają jeden poziom zagnieżdżenia.

Przenoś prace przeciąganiem albo wyborem z pola „Grupa”. Wybór zawiera np. `Wykonane prace / Fine line`. Kategorie są zapisane w JSON jako `groups[2].categories`, każda z własnym trwałym ID, nazwą i listą prac. Publiczne Portfolio czyta już ich zawartość; nie dodajemy jeszcze filtrów kategorii. Najpierw wyświetla prace bez kategorii, następnie kategorie w ustalonej kolejności.

Starsze JSON-y i kopie robocze są migrowane: Wolne wzory i Wykonane prace zachowują przypisania, inne dawne grupy stają się kategoriami Wykonanych prac. Prace bez przypisania trafiają do Nowych. Opisy, ID zdjęć oraz kolejność karuzeli opublikowanych prac są zachowywane.

## Usuwanie prac

Przycisk **Usuń pracę** przy każdym zdjęciu usuwa wpis z biblioteki, jego grupy/kategorii oraz karuzeli. „Cofnij zmianę” przywraca opis, pozycję i wszystkie przypisania (w bieżącej sesji, w ramach historii 30 zmian).

Usunięcie zapisuje ścieżkę zdjęcia w `excludedSources` (blokada ponownego indeksowania) i `deletedSources` (kolejka usuwania plików) w eksportowanym JSON. Kolejkę widać w panelu nad karuzelą; obie listy przechodzą przez kopię roboczą i import/eksport. Cofnięcie zmiany usuwa także zlecenie skasowania zdjęcia.

Zmiana trafia na stronę po pobraniu JSON, podmianie w repozytorium i pushu. **Runner usuwa wtedy również plik zdjęcia** i zapisuje to w commicie. Pliki są usuwane tylko z `assets/img/portfolio`, po sprawdzeniu ścieżek i dowiązań. Jeśli inna praca nadal używa tego samego zdjęcia, plik zostaje zachowany. Puste katalogi nie są usuwane. Dawne wpisy tylko w `excludedSources` nadal oznaczają wyłącznie wykluczenie z indeksowania — nie są automatycznie kasowane z dysku.

Po publikacji „Cofnij” w starej sesji edytora nie odtworzy skasowanego pliku na serwerze. Aby przywrócić taką pracę, odtwórz zdjęcie z historii Git i przypisanie w JSON; jeśli zdjęcie ma być ponownie wykryte jako nowe, usuń jego wykluczenie z `excludedSources`.

## Kreator opisów (alt)

Przycisk **Dodaj opis / Edytuj opis** otwiera zdjęcie i kreator:

- **Motyw**: krótko opisujesz to, co widać, np. „róże i sztylet”.
- **Styl**: lista m.in. blackwork, linework / fine line, ilustracyjny, napis / tekst, art nouveau / secesja, abstrakcja, dotwork, ornamentalny, geometryczny, minimalistyczny i realizm. Styl możesz pozostawić nieokreślony.
- **Część ciała**: dla wykonanych prac wybierasz obszar sylwetki lub podpisany przycisk. Dostępne są dłoń, przedramię, ramię, bark, klatka piersiowa, plecy, żebra, brzuch, udo, kolano, łydka, stopa i szyja. Wybór jest opcjonalny.
- Podgląd pokazuje gotowy tekst przed zapisaniem. Wykonane prace otrzymują końcówkę „– realizacja Lexie Tattoo Warszawa Mokotów”, a wolne wzory „– wolny wzór Lexie Tattoo Warszawa Mokotów”.

Dla Nowych możesz wstępnie wybrać rodzaj opisu. Przeniesienie pracy do publicznej grupy ustala właściwy dopisek; przeniesienie pomiędzy Wolnymi wzorami a Wykonanymi pracami aktualizuje opis wygenerowany z kreatora. Część ciała pozostaje w metadanych, ale nie jest wyświetlana w opisie wolnego wzoru. Kategorie traktowane są jak Wykonane prace.

Istniejące opisy otwierają się w trybie **Własny opis** i pozostają bez zmian, dopóki ich nie edytujesz. Możesz przełączyć je na kreator. Ręczne opisy nie są nadpisywane przy przenoszeniu pracy. Ustawienia kreatora znajdują się w `item.altDetails`, a gotowy tekst nadal w standardowym `item.alt`. Anulowanie nie zapisuje zmian; zapis można cofnąć.

## Automatyczne indeksowanie po pushu

1. Dodaj zdjęcia do `assets/img/portfolio` (także podkatalogi) i wypchnij zmiany na `main`.
2. Workflow `.github/workflows/static.yml` uruchamia testy i skaner **przed wdrożeniem Pages**.
3. Nowe ścieżki są dopisywane do grupy **Nowe**, z pustym opisem i `featured: false`. Istniejące wpisy zachowują opisy, kategorię i kolejność. Brakujące pliki są raportowane — wpisy nie są automatycznie usuwane.
4. Jeśli dane się zmieniły, runner tworzy commit dla `data/portfolio.json` oraz usuniętych zdjęć i wypycha go na `main`. Ten sam checkout trafia do Pages. Jeśli nie ma zmian, dodatkowy commit nie powstaje.
5. Po udanym wdrożeniu odśwież panel, uzupełnij opisy i przenieś zdjęcia z Nowych do właściwej grupy/kategorii. Pobierz JSON, podmień go w repozytorium i wypchnij kolejną zmianę.

Obsługiwane rozszerzenia: JPG, JPEG, PNG, WebP, AVIF i GIF. HEIC trzeba wcześniej przekonwertować. Tożsamość zdjęcia jest określana przez ścieżkę, nie zawartość pliku. Ukryte pliki i dowiązania są pomijane.

Runner używa Node.js 22 i uprawnienia `contents: write` standardowego `GITHUB_TOKEN`. Reguły ochrony `main` muszą dopuszczać ten automatyczny commit. Nie ma force-pusha ani omijania ochrony gałęzi. Jeśli równolegle pojawi się nowszy push i zapis zostanie odrzucony, najnowszy run wykona indeksowanie na nowym stanie; w razie potrzeby ponów workflow. Ręczne uruchomienie wdrożenia działa tylko dla `main`.

Zgodnie z [dokumentacją GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), push za pomocą `GITHUB_TOKEN` nie wyzwala kolejnego zwykłego workflow `push`. Dlatego indeksowanie i wdrożenie pozostają w jednym przebiegu. Synchronizacja repozytorium downstream czeka teraz na udane zakończenie tego przebiegu, aby uwzględnić również commit indeksu.

## Pozostałe funkcje panelu

- Karuzela: przeciągaj karty poziomo lub używaj strzałek. Klawiatura: fokus na karcie i Alt + ← / →.
- Biblioteka: opisy zdjęć, wybór prac do karuzeli, grupy i kategorie oraz kolejność. Alt + ↑ / ↓ lub przyciski zmieniają kolejność pracy.
- Wyszukiwanie nie usuwa prac z eksportu. Podczas wyszukiwania sortowanie biblioteki jest wyłączone, ale przenoszenie do grup działa.
- „Cofnij zmianę” przechowuje do 30 operacji w bieżącej sesji. Opis zatwierdzasz przyciskiem „Zapisz opis”.
- Kopia robocza zapisuje się lokalnie w przeglądarce. Po ponownym otwarciu panel proponuje jej przywrócenie. Po indeksowaniu nowych zdjęć korzystaj z aktualnych danych ze strony, aby pracować na najnowszym stanie. Przywrócenie starszej kopii zastępuje stan edytora; nie publikuje jej automatycznie.
- Pobierz `portfolio.json`, podmień `data/portfolio.json` i opublikuj zmianę. Możesz również wczytać wcześniej zapisany JSON. Import pliku można cofnąć.

## Narzędzie lokalne i testy

Wymagany Node.js 22.18 lub nowszy. Bez zależności npm.

```sh
# Tylko raport (bez zmiany plików):
node scripts/index-portfolio.mjs

# Osobny plik do sprawdzenia:
node scripts/index-portfolio.mjs --output /tmp/portfolio-nowe.json

# Aktualizacja wejściowego JSON (tak samo jak na runnerze):
node scripts/index-portfolio.mjs --write --delete-files

# Testy:
node --test tests/portfolio-*.test.mjs
```

Nowe zdjęcia zawsze trafiają do Nowych. `--output` nie nadpisuje istniejącego pliku. `--write` zapisuje wejściowy plik atomowo, tylko jeśli zmieniły się dane. Fizyczne usuwanie zdjęć wymaga dodatkowo `--delete-files`; bez tej opcji kolejka pozostaje w JSON. Raport i `--output` nigdy nie usuwają plików. `--dir` i `--data` pozwalają wskazać inny katalog oraz wejściowy JSON do testów; ścieżki zdjęć nadal zakładają docelowe `assets/img/portfolio`.

## Pracownia opinii

Otwórz `/admin/reviews.html` przez serwer HTTP. Linki w nagłówkach pozwalają przejść między panelem opinii i portfolio. Edytor korzysta z istniejącego `data/reviews.json`; nie wymaga zmian na publicznej stronie.

- **Dodaj opinię / Edytuj**: autor, ocena 1–5, opcjonalny rok, treść oraz podgląd. Enter dodaje nową linię; nie trzeba wpisywać HTML. Istniejące znaczniki `<br />` są zachowywane, jeśli nie zmienisz treści. Anulowanie nie zapisuje zmian.
- **Kolejność**: przeciągnij uchwyt po lewej albo użyj ↑ / ↓. Klawiaturą: ustaw fokus na karcie i użyj Alt + ↑ / ↓. Kolejność listy jest kolejnością na stronie.
- **Na stronie**: odznaczenie ukrywa opinię bez usuwania jej z danych. Ukryte opinie nie trafiają do publicznej karuzeli.
- **Usuń** usuwa wpis z eksportowanego JSON. „Cofnij zmianę” przywraca również treść i pozycję (do 30 operacji w bieżącej sesji).
- Wyszukiwanie i filtr widoczności nie ograniczają eksportu. Porządkowanie jest dostępne po wyczyszczeniu filtrów.
- Kopia robocza zapisuje się lokalnie, niezależnie od portfolio. Po odświeżeniu można ją przywrócić lub odrzucić. Przywrócenie zastępuje stan edytora; starsza kopia nie jest automatycznie scalana z aktualnymi danymi strony.
- **Pobierz reviews.json** lub **Kopiuj JSON** eksportuje wszystkie opinie. Podmień `data/reviews.json` w repozytorium i wypchnij zmianę, aby ją opublikować. Pobranie samo nie publikuje danych. Usunięcie opinii nie wymaga kasowania plików zdjęć ani dodatkowego runnera.
- **Wczytaj JSON** pozwala zaimportować zapisany plik; niepoprawne dane są odrzucane bez utraty bieżących zmian. Import można cofnąć.

Pola używane przez stronę: `name`, `star`, `year`, `content`, `featured` (`false` ukrywa opinię). Edytor zachowuje dodatkowe metadane. Rok jest aktualnie ukryty w publicznym widoku.
