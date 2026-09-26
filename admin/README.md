# Pracownia portfolio

Otwórz `/admin/reorder.html` przez serwer HTTP (lokalnie lub na GitHub Pages).
Panel jest statycznym edytorem: **nie zapisuje zmian bezpośrednio do repozytorium**.

## Edycja i publikacja

- Karuzela: przeciągaj karty poziomo lub używaj strzałek. Klawiatura: fokus na karcie i Alt + ← / →.
- Biblioteka: opisy zdjęć, wybór prac do karuzeli, grupy oraz kolejność. Przeciągaj zdjęcia pomiędzy grupami lub wybierz grupę z listy. Alt + ↑ / ↓ lub przyciski zmieniają kolejność pracy.
- Wyszukiwanie nie usuwa prac z eksportu. Podczas wyszukiwania sortowanie biblioteki jest wyłączone; przenoszenie do grup działa.
- „Wolne wzory” pozostają pierwszą grupą. Pozostałe grupy należą do Portfolio.
- „Cofnij zmianę” przechowuje do 30 operacji w bieżącej sesji. Edycja opisu jest zapisywana po opuszczeniu pola.
- Kopia robocza zapisuje się w lokalnej pamięci przeglądarki, jeśli jest dostępna. Po ponownym otwarciu panel proponuje jej przywrócenie; nie zastępuje samodzielnie danych ze strony.
- Pobierz `portfolio.json`, podmień `data/portfolio.json` i opublikuj zmianę. Możesz też wczytać zapisany wcześniej JSON. Import pliku można cofnąć.

## Indeksowanie w panelu

1. Najpierw umieść zdjęcia w lokalnym `assets/img/portfolio`.
2. Kliknij „Wybierz katalog portfolio” i wybierz właśnie ten katalog.
3. Panel porówna ścieżki plików z aktualną biblioteką. Obsługuje JPG, JPEG, PNG, WebP, AVIF i GIF, również w podkatalogach. HEIC trzeba wcześniej przekonwertować.
4. Zaznacz nowe zdjęcia i wskaż grupę docelową. Opisy nowych prac są puste — uzupełnij je zgodnie z zawartością zdjęć. Nowe prace nie trafiają automatycznie do karuzeli.
5. Pobierz JSON i opublikuj go **razem ze zdjęciami**. Wybór katalogu nie przesyła żadnych plików na serwer. Lokalny podgląd nowych zdjęć działa do zamknięcia panelu; po przywróceniu kopii nieopublikowane zdjęcia mogą wymagać ponownego wskazania katalogu.

Istniejące opisy, ID i kolejność są zachowywane. Brak pliku w wybranym katalogu jest raportowany i nie usuwa wpisu. Pliki o różnych ścieżkach są osobnymi zdjęciami, nawet jeśli mają tę samą zawartość. Wybieraj cały katalog `portfolio`, nie jego podkatalog.

## Indeksowanie z terminala

Wymagany Node.js 22.18 lub nowszy. Skrypt nie potrzebuje pakietów npm.

Sam raport dla `assets/img/portfolio`:

```sh
node scripts/index-portfolio.mjs
```

Nowy plik JSON z nowymi zdjęciami w wybranej grupie:

```sh
node scripts/index-portfolio.mjs --group "Wykonane prace" --output /tmp/portfolio-nowe.json
```

Wczytaj wynik w panelu, uzupełnij opisy i sprawdź grupy. Skrypt nie nadpisuje wejściowego `data/portfolio.json` ani istniejącego pliku wyjściowego. `--dir` i `--data` pozwalają wskazać inny katalog skanowania i wejściowy JSON; generowane ścieżki nadal zakładają docelowe `assets/img/portfolio`.

## Sprawdzenie indeksowania

```sh
node --test tests/portfolio-index.test.mjs
```

Testy obejmują duplikaty, znaki specjalne w ścieżkach, kolizje ID, zachowanie metadanych oraz ochronę pliku źródłowego.
