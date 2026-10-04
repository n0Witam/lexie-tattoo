# Wersje językowe strony

Polskie pliki HTML w katalogach publicznych są źródłem układu i treści. Angielskie odpowiedniki znajdują się w `en/`; nie edytuj ich ręcznie.

Tłumaczenia przechowujemy w `data/translations/en.json`: kluczem jest polski tekst, a wartością tłumaczenie angielskie. Klucze mają pojedyncze spacje, także gdy HTML zawiera podział wiersza lub twardą spację. Wartości mogą zawierać nowe linie, np. w wiadomości formularza i opiniach.

Po zmianie publicznych tekstów, opisów zdjęć lub opinii uzupełnij słownik i uruchom:

```sh
node scripts/build-languages.mjs
node --test tests/*.test.mjs
```

Generator aktualizuje angielskie strony, słownik JavaScript w `assets/js/locales/en.js` i dwujęzyczny `sitemap.xml`. Zachowuje te same CSS, zdjęcia, identyfikatory sekcji i formularze. W workflow GitHub Pages uruchamia się automatycznie przed testami i publikacją. Brak tłumaczenia nowego tekstu HTML blokuje generowanie; testy kontrolują też tłumaczenia aktualnych opinii i opisów zdjęć.

Przełącznik w stopce prowadzi do odpowiednika bieżącej podstrony, zachowując kotwicę i parametry adresu. Ręczny wybór jest zapisywany pod kluczem `lexie-language` w localStorage. Przy pierwszej wizycie polski język przeglądarki wybiera PL, pozostałe EN. Bez ustawień językowych używamy PL. Bezpośrednie wejście na adres `/en/` otwiera wersję angielską, jeżeli użytkownik nie zapisał wcześniej innego wyboru. Parametr `?lang=pl` lub `?lang=en` wymusza dany język również przy wyłączonym localStorage.

Panel administracyjny pozostaje po polsku. Nowe opisy i opinie wprowadzone w panelu należy również dopisać do słownika przed publikacją.
