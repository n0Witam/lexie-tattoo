# Potwierdzone formularze i konwersje GA4

Strona ma dwa rodzaje zgłoszeń: `contact` i `available_design`. Zdarzenie `generate_lead` jest wysyłane dopiero po potwierdzeniu zapisu w Google Forms, jeżeli analityka była zaakceptowana przed rozpoczęciem wysyłki i nadal jest zaakceptowana przy potwierdzeniu. Nie zawiera imienia, e-maila, wiadomości, zdjęć ani identyfikatora odpowiedzi. Podgląd `contact:preview-success` nie wysyła konwersji.

## 1. Wdrożenie na koncie właściciela formularza

Obecny skrypt `wyslijEmail` i jego wyzwalacz w arkuszu pozostają na miejscu. Utwórz **osobny projekt** w [Google Apps Script](https://script.google.com/) na koncie mającym dostęp do formularza. Nowy projekt ma prywatną kopię tego samego szablonu powiadomień w `Email.gs`.

1. Wklej zawartość `Code.gs` do pliku o tej samej nazwie. ID właściwego formularza jest już wpisane.
2. Dodaj plik HTML o nazwie **Bridge** i wklej zawartość `Bridge.html`.
3. Dodaj plik skryptu **Email** i wklej zawartość `Email.gs`.
4. Ustaw strefę czasową **Europe/Warsaw**. W `Email.gs` odbiorca powiadomień jest już ustawiony zgodnie z Twoim wskazaniem. Jeśli w starym skrypcie arkusza nadal masz przykładowy adres odbiorcy, zastąp go tym samym adresem — dotyczy to zwykłych odpowiedzi Google Forms.
5. Zapisz projekt. W edytorze wybierz funkcję **`skonfigurujFormularz` (bez końcowego `_`)**, uruchom ją i zaakceptuj dostęp do formularza, wysyłania poczty i odczytu adresu swojego konta. **Ta funkcja nie wysyła wiadomości ani odpowiedzi.** Rozpoznaje pola po tytułach i dodaje jedno opcjonalne pole „Identyfikator zgłoszenia (techniczny)”. Pole będzie widoczne w Google Forms i arkuszu odpowiedzi, ale nie pojawi się w formularzach na stronie. Funkcja sprawdza tożsamość wykonującego, blokując konfigurację anonimowym użytkownikom aplikacji. Prywatne funkcje z `_` pozostają ukryte w selektorze.
6. Jeżeli nazwy pytań nie pozwalają ich rozpoznać, uruchom `wypiszPola` i ustaw we właściwościach skryptu `NAME_ITEM_ID`, `EMAIL_ITEM_ID`, `MESSAGE_ITEM_ID`, `REFERENCE_ITEM_ID` zgodnie z identyfikatorami z logu. Imię i e-mail muszą być polami tekstowymi, a wiadomość akapitem.
7. Kliknij **Wdróż → Nowe wdrożenie → Aplikacja internetowa**. Ustaw **Wykonuj jako: Ja**, **Kto ma dostęp: Każdy** (również osoby niezalogowane). Wdróż i skopiuj adres `https://script.google.com/macros/s/…/exec`.
8. Wklej adres do `FORM_CONFIRMATION_URL` w `assets/js/config.js`, zmień wersję importu `config.js` w `site.js` i opublikuj stronę. Możesz też przekazać adres w tej rozmowie, aby konfiguracja została wpisana do kodu.

Do czasu wpisania adresu strona korzysta z dotychczasowego wysyłania Google Forms. Ta ścieżka **nie emituje potwierdzonych konwersji**. Nie wyłączamy działających formularzy w oczekiwaniu na wdrożenie skryptu.

Apps Script uruchomiony jako właściciel nie pyta odwiedzających o dostęp do konta Google. Lista dozwolonych stron obejmuje `https://lexietattoo.pl` i `https://www.lexietattoo.pl`. Przy zmianie domeny należy uaktualnić `LEXIE_ORIGINS` i opublikować nową wersję aplikacji. Wersja `/dev` nie służy do produkcji. Po zmianie plików aplikacji wybierz **Zarządzaj wdrożeniami → Edytuj → Nowa wersja**, zachowując adres `/exec`.

## 2. Konfiguracja kontenera GTM-5245GRKX

Pozostaw istniejący tag Google Analytics z identyfikatorem `G-H3EH3ETSMH`.

1. **Reguły → Nowa → Zdarzenie niestandardowe**: nazwa zdarzenia dokładnie `generate_lead`, bez wyrażeń regularnych. Nazwij regułę „Potwierdzone zgłoszenie”.
2. **Zmienne → Nowa → Zmienna warstwy danych**: nazwa w warstwie `form_type`, wersja 2. Nazwij zmienną „DLV – form_type”. Analogicznie dodaj „DLV – page_language” dla `page_language`.
3. **Tagi → Nowy → Google Analytics → Google Analytics: zdarzenie GA4**: identyfikator pomiaru `G-H3EH3ETSMH`, nazwa zdarzenia `generate_lead`.
4. W parametrach zdarzenia dodaj `form_type` = `{{DLV – form_type}}` oraz `page_language` = `{{DLV – page_language}}`.
5. Przypisz regułę „Potwierdzone zgłoszenie”, zapisz, sprawdź w **Podglądzie** i opublikuj kontener. Nie dodawaj drugiego tagu zbierającego ten sam `generate_lead`.
6. W GA4 oznacz `generate_lead` jako **zdarzenie kluczowe**. Automatycznego `form_submit` nie używaj jako potwierdzenia zapisu.
7. Jeżeli chcesz porównywać typy formularzy w standardowych raportach, zarejestruj `form_type` jako niestandardowy wymiar o zakresie **Zdarzenie**.

## 3. Sprawdzenie po wdrożeniu

- Z odrzuconą analityką wyślij jedno testowe zgłoszenie. Powinno pojawić się w Google Forms/arkuszu i poczcie. GTM i Analytics nie powinny się wczytać; `generate_lead` nie powinno trafić do warstwy danych.
- Z zaakceptowaną analityką wyślij zgłoszenie przez formularz kontaktowy i rezerwację wolnego wzoru. Dla każdej odpowiedzi sprawdź jeden `generate_lead` w Tag Assistant, z właściwym `form_type`, oraz w GA4 DebugView.
- Sprawdź załączone zdjęcie w powiadomieniu mailowym i ustawiony `replyTo`.
- Nie używaj podglądu confetti jako testu konwersji. Zdarzenie `contact:preview-success` ma wyłącznie efekt wizualny.
- Przy błędzie lub braku potwierdzenia pola pozostają wypełnione. Ponowienie niezmienionego zgłoszenia na tej samej stronie, bez odświeżenia, zachowuje jego identyfikator. Skrypt pod blokadą sprawdza ostatnie 7 dni odpowiedzi i zwraca istniejące potwierdzenie, zamiast tworzyć duplikat lub ponawiać maila. Starsza próba jest odrzucana. Po zmianie treści lub przeładowaniu strony powstaje nowy identyfikator.

Konwersja oznacza **zapisaną odpowiedź**, nie dostarczenie e-maila do skrzynki. Błąd `MailApp` nie usuwa odpowiedzi i nie cofa konwersji; jest raportowany w logach wykonania Apps Script. Skrypt nie ponawia automatycznie maila dla zapisanej odpowiedzi, aby nie wysłać podwójnego powiadomienia. Awaria pomiędzy zapisem a wysłaniem powiadomienia również może wymagać sprawdzenia odpowiedzi w arkuszu.

## 4. Raport skuteczności

W GA4 porównuj **sesje z co najmniej jednym `generate_lead` / wszystkie mierzone sesje**, a nie liczbę formularzy / odsłony. W raporcie pozyskiwania ruchu użyj źródła/medium **sesji** i wybierz `generate_lead` jako zdarzenie kluczowe. Pomiar obejmuje tylko wizyty ze zgodą na analitykę; liczba odpowiedzi w Google Forms może być większa.

Dla Instagramu używaj oznaczonych linków, np. `https://lexietattoo.pl/?utm_source=instagram&utm_medium=social&utm_campaign=bio`. Bez oznaczenia aplikacja może nie przekazać źródła. Konwersje Google Ads zostaną skonfigurowane oddzielnie.

Dokumentacja: [aplikacje internetowe Apps Script](https://developers.google.com/apps-script/guides/web), [komunikacja HTML Service](https://developers.google.com/apps-script/guides/html/communication), [FormResponse.submit](https://developers.google.com/apps-script/reference/forms/form-response#submit()), [ograniczenia wyzwalaczy](https://developers.google.com/apps-script/guides/triggers), [zalecany generate_lead](https://developers.google.com/analytics/devguides/collection/ga4/reference/events#generate_lead).
