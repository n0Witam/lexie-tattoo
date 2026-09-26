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

## Automatyczne indeksowanie po pushu

1. Dodaj zdjęcia do `assets/img/portfolio` (także podkatalogi) i wypchnij zmiany na `main`.
2. Workflow `.github/workflows/static.yml` uruchamia testy i skaner **przed wdrożeniem Pages**.
3. Nowe ścieżki są dopisywane do grupy **Nowe**, z pustym opisem i `featured: false`. Istniejące wpisy zachowują opisy, kategorię i kolejność. Brakujące pliki są raportowane — wpisy nie są automatycznie usuwane.
4. Jeśli dane się zmieniły, runner tworzy commit tylko dla `data/portfolio.json` i wypycha go na `main`. Ten sam checkout trafia do Pages. Jeśli nie ma zmian, dodatkowy commit nie powstaje.
5. Po udanym wdrożeniu odśwież panel, uzupełnij opisy i przenieś zdjęcia z Nowych do właściwej grupy/kategorii. Pobierz JSON, podmień go w repozytorium i wypchnij kolejną zmianę.

Obsługiwane rozszerzenia: JPG, JPEG, PNG, WebP, AVIF i GIF. HEIC trzeba wcześniej przekonwertować. Tożsamość zdjęcia jest określana przez ścieżkę, nie zawartość pliku. Ukryte pliki i dowiązania są pomijane.

Runner używa Node.js 22 i uprawnienia `contents: write` standardowego `GITHUB_TOKEN`. Reguły ochrony `main` muszą dopuszczać ten automatyczny commit. Nie ma force-pusha ani omijania ochrony gałęzi. Jeśli równolegle pojawi się nowszy push i zapis zostanie odrzucony, najnowszy run wykona indeksowanie na nowym stanie; w razie potrzeby ponów workflow. Ręczne uruchomienie wdrożenia działa tylko dla `main`.

Zgodnie z [dokumentacją GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), push za pomocą `GITHUB_TOKEN` nie wyzwala kolejnego zwykłego workflow `push`. Dlatego indeksowanie i wdrożenie pozostają w jednym przebiegu. Synchronizacja repozytorium downstream czeka teraz na udane zakończenie tego przebiegu, aby uwzględnić również commit indeksu.

## Pozostałe funkcje panelu

- Karuzela: przeciągaj karty poziomo lub używaj strzałek. Klawiatura: fokus na karcie i Alt + ← / →.
- Biblioteka: opisy zdjęć, wybór prac do karuzeli, grupy i kategorie oraz kolejność. Alt + ↑ / ↓ lub przyciski zmieniają kolejność pracy.
- Wyszukiwanie nie usuwa prac z eksportu. Podczas wyszukiwania sortowanie biblioteki jest wyłączone, ale przenoszenie do grup działa.
- „Cofnij zmianę” przechowuje do 30 operacji w bieżącej sesji. Opis zapisuje się po opuszczeniu pola.
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
node scripts/index-portfolio.mjs --write

# Testy:
node --test tests/portfolio-index.test.mjs
```

Nowe zdjęcia zawsze trafiają do Nowych. `--output` nie nadpisuje istniejącego pliku. `--write` zapisuje wejściowy plik atomowo, tylko jeśli zmieniły się dane. `--dir` i `--data` pozwalają wskazać inny katalog oraz wejściowy JSON do testów; ścieżki zdjęć nadal zakładają docelowe `assets/img/portfolio`.
