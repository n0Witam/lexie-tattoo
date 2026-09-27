import { el, qs, fetchJSON } from './util.js';

const DATA_URL = new URL('../../data/reviews.json', import.meta.url);
const DRAFT_KEY = 'lexie-reviews-draft-v1';
const text = value => String(value).replace(/<br\s*\/?>/gi, '\n').replace(/\r\n/g, '\n').trim();
const stars = rating => '★'.repeat(rating) + '☆'.repeat(5 - rating);
const status = qs('#status'), dialog = qs('#reviewDialog');
let state, draft, history = [], editing = null, dragIndex = null, returnFocus;

// Validate imports before replacing the editor. Preserve metadata and original text.
function validate(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) throw new Error('Plik musi zawierać listę „items”.');
  data.items.forEach((item, i) => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || typeof item.content !== 'string' || !text(item.content)
      || !Number.isInteger(item.star) || item.star < 1 || item.star > 5
      || (item.featured !== undefined && typeof item.featured !== 'boolean')
      || (item.year != null && item.year !== '' && (!Number.isInteger(Number(item.year)) || Number(item.year) < 1900 || Number(item.year) > 2100))) {
      throw new Error(`Opinia ${i + 1}: sprawdź autora, treść, ocenę (1–5), rok i widoczność.`);
    }
  });
  return structuredClone(data);
}
function output() { return JSON.stringify({ version: 1, ...state, updated: new Date().toISOString().slice(0, 10) }, null, 2) + '\n'; }
function saveDraft(message) {
  if (draft) { status.textContent = `${message} Starsza kopia czeka na decyzję — pobierz JSON, aby zachować zmiany.`; return; }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    status.textContent = `${message} Kopia robocza zapisana w tej przeglądarce.`;
  } catch { status.textContent = `${message} Kopia lokalna niedostępna — pobierz JSON.`; }
}
function change(mutator, message) {
  if (state) { history.push(structuredClone(state)); if (history.length > 30) history.shift(); }
  mutator(); render(); saveDraft(message);
}
function filtered() { return Boolean(qs('#search').value.trim() || qs('#visibility').value !== 'all'); }
function focusRow(index) { qs(`[data-review-index="${index}"]`)?.focus({ preventScroll: true }); }
function move(from, to) {
  if (filtered() || from === to || from < 0 || to < 0 || to >= state.items.length) return;
  change(() => state.items.splice(to, 0, state.items.splice(from, 1)[0]), 'Zmieniono kolejność opinii.');
  focusRow(to);
}
function action(label, handler, extra = {}) { return el('button', { type: 'button', class: 'btn', onclick: handler, ...extra }, label); }
function render() {
  const visible = state.items.filter(item => item.featured !== false).length;
  qs('#itemCount').textContent = state.items.length;
  qs('#visibleCount').textContent = visible;
  qs('#hiddenCount').textContent = state.items.length - visible;
  qs('#btnUndo').disabled = !history.length;
  ['#btnAdd', '#btnDownload', '#btnCopy'].forEach(selector => qs(selector).disabled = false);
  const query = qs('#search').value.trim().toLocaleLowerCase('pl'), filter = qs('#visibility').value;
  qs('#orderHint').textContent = filtered() ? 'Wyniki wyszukiwania. Wyczyść wyszukiwanie i wybierz „Wszystkie opinie”, aby zmienić kolejność.' : 'Kolejność poniżej odpowiada kolejności na stronie. Przeciągnij uchwyt lub użyj strzałek ↑ ↓ (klawiatura: Alt + ↑ / ↓). Ukryte opinie są pomijane na stronie.';
  const rows = [];
  state.items.forEach((item, index) => {
    if (query && !`${item.name} ${text(item.content)} ${item.year || ''}`.toLocaleLowerCase('pl').includes(query)) return;
    const shown = item.featured !== false;
    if ((filter === 'visible' && !shown) || (filter === 'hidden' && shown)) return;
    const row = el('article', { class: 'admin-review-row', tabindex: '0', dataset: { reviewIndex: index }, 'aria-label': `Opinia ${index + 1}: ${item.name}` });
    const handle = el('span', { class: 'review-drag', draggable: filtered() ? 'false' : 'true', title: 'Przeciągnij, aby zmienić kolejność', 'aria-hidden': 'true' }, '⠿');
    handle.addEventListener('dragstart', event => {
      if (filtered()) { event.preventDefault(); return; }
      dragIndex = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); row.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => { dragIndex = null; row.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target')); });
    row.addEventListener('dragover', event => { if (dragIndex !== null && !filtered()) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; row.classList.add('drop-target'); } });
    row.addEventListener('dragleave', event => { if (!row.contains(event.relatedTarget)) row.classList.remove('drop-target'); });
    row.addEventListener('drop', event => { event.preventDefault(); if (dragIndex !== null) move(dragIndex, index); dragIndex = null; });
    row.addEventListener('keydown', event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); move(index, index + (event.key === 'ArrowUp' ? -1 : 1)); } });
    row.append(el('div', { class: 'review-position' }, handle, String(index + 1).padStart(2, '0')),
      el('div', { class: 'admin-review-copy' },
        el('div', { class: 'admin-review-heading' }, el('h3', {}, item.name), el('span', { class: 'admin-review-stars', role: 'img', 'aria-label': `${item.star} na 5` }, stars(item.star)), item.year ? el('span', { class: 'review-year' }, item.year) : null),
        el('p', { class: 'admin-review-excerpt' }, text(item.content))),
      el('div', { class: 'admin-review-controls' },
        el('label', { class: 'admin-check' }, el('input', { type: 'checkbox', checked: shown ? '' : null, onchange: () => { change(() => item.featured = !shown, 'Zmieniono widoczność opinii.'); focusRow(index); } }), 'Na stronie'),
        el('div', { class: 'admin-actions' },
          action('↑', () => move(index, index - 1), { class: 'btn icon-button', 'aria-label': 'Przesuń wyżej', disabled: index === 0 || filtered() ? '' : null }),
          action('↓', () => move(index, index + 1), { class: 'btn icon-button', 'aria-label': 'Przesuń niżej', disabled: index === state.items.length - 1 || filtered() ? '' : null })),
        el('div', { class: 'admin-actions' }, action('Edytuj', () => openEditor(index)), action('Usuń', () => {
          change(() => state.items.splice(index, 1), 'Usunięto opinię. Możesz cofnąć zmianę.');
          if (state.items.length) focusRow(Math.min(index, state.items.length - 1)); else qs('#btnAdd').focus({ preventScroll: true });
        }))));
    rows.push(row);
  });
  qs('#reviewsList').replaceChildren(...rows);
  qs('#emptyReviews').hidden = rows.length > 0;
  qs('#emptyReviews').textContent = state.items.length ? 'Brak opinii pasujących do wyszukiwania.' : 'Jeszcze nie ma opinii. Dodaj pierwszą przyciskiem powyżej.';
}
function preview() {
  qs('#previewName').textContent = qs('#reviewName').value.trim() || 'Imię autora';
  qs('#previewContent').textContent = text(qs('#reviewContent').value) || 'Tutaj pojawi się treść opinii.';
  qs('#previewStars').textContent = stars(Number(qs('#reviewStars').value));
  qs('#previewStars').setAttribute('aria-label', `${qs('#reviewStars').value} na 5`);
}
function openEditor(index = null) {
  editing = index; returnFocus = document.activeElement;
  const item = index === null ? { name: '', star: 5, year: new Date().getFullYear(), content: '', featured: true } : state.items[index];
  qs('#reviewDialogTitle').textContent = index === null ? 'Dodaj opinię' : 'Edytuj opinię';
  qs('#reviewName').value = item.name;
  qs('#reviewStars').value = item.star;
  qs('#reviewYear').value = item.year || '';
  qs('#reviewContent').value = text(item.content);
  qs('#reviewFeatured').checked = item.featured !== false;
  qs('#reviewName').setCustomValidity(''); qs('#reviewContent').setCustomValidity('');
  preview(); dialog.showModal(); qs('#reviewName').focus({ preventScroll: true });
}
dialog.addEventListener('close', () => {
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else if (editing !== null) focusRow(editing);
  else qs('#btnAdd').focus({ preventScroll: true });
});
qs('#reviewForm').addEventListener('input', event => { event.target.setCustomValidity?.(''); preview(); });
qs('#reviewForm').addEventListener('submit', event => {
  event.preventDefault();
  for (const id of ['#reviewName', '#reviewContent']) qs(id).setCustomValidity(text(qs(id).value) ? '' : 'Uzupełnij to pole.');
  if (!qs('#reviewForm').reportValidity()) return;
  const original = editing === null ? {} : state.items[editing];
  const item = { ...original, name: qs('#reviewName').value.trim(), star: Number(qs('#reviewStars').value), content: qs('#reviewContent').value.trim(), featured: qs('#reviewFeatured').checked };
  // Editing another field must not rewrite legacy <br /> formatting or optional fields.
  if (original.content !== undefined && text(original.content) === item.content) item.content = original.content;
  if (editing !== null && original.featured === undefined && item.featured) delete item.featured;
  const year = qs('#reviewYear').value;
  if (String(original.year ?? '') !== year) { if (year) item.year = Number(year); else delete item.year; }
  change(() => { if (editing === null) state.items.push(item); else state.items[editing] = item; }, editing === null ? 'Dodano opinię.' : 'Zapisano opinię.');
  dialog.close();
});
qs('#btnClose').onclick = qs('#btnCancel').onclick = () => dialog.close();
qs('#btnAdd').onclick = () => openEditor();
qs('#search').oninput = qs('#visibility').onchange = () => { if (state) render(); };
qs('#btnUndo').onclick = () => { if (!history.length) return; state = history.pop(); render(); saveDraft('Cofnięto zmianę.'); };
qs('#btnDownload').onclick = () => {
  const url = URL.createObjectURL(new Blob([output()], { type: 'application/json' }));
  const link = el('a', { href: url, download: 'reviews.json' }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'Pobrano reviews.json. Podmień data/reviews.json w repozytorium i opublikuj zmiany.';
};
qs('#btnCopy').onclick = async () => { try { await navigator.clipboard.writeText(output()); status.textContent = 'Skopiowano JSON.'; } catch { status.textContent = 'Nie można skopiować do schowka. Użyj „Pobierz reviews.json”.'; } };
qs('#btnLoad').onclick = () => qs('#jsonInput').click();
qs('#jsonInput').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { const data = validate(JSON.parse(await file.text())); change(() => state = data, 'Wczytano plik.'); }
  catch (error) { status.textContent = `Nie wczytano pliku. ${error.message}`; }
  event.target.value = '';
};
qs('#btnRestore').onclick = () => { const restored = draft; draft = null; qs('#draftNotice').hidden = true; change(() => state = restored, 'Przywrócono kopię roboczą.'); };
qs('#btnDiscard').onclick = () => { draft = null; qs('#draftNotice').hidden = true; if (state) saveDraft('Pozostawiono bieżące dane.'); else { try { localStorage.removeItem(DRAFT_KEY); } catch {} } };
async function init() {
  try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) draft = validate(JSON.parse(raw)); } catch { /* An unavailable or invalid local draft must not block loading. */ }
  qs('#btnLoad').disabled = true;
  try { const { data } = await fetchJSON(DATA_URL, { cache: 'no-store' }); state = validate(data); render(); status.textContent = 'Wczytano opinie ze strony. Zmiany publikujesz przez plik reviews.json.'; }
  catch { status.textContent = 'Nie udało się wczytać opinii. Wczytaj reviews.json z dysku lub przywróć kopię roboczą.'; }
  finally { qs('#draftNotice').hidden = !draft; qs('#btnLoad').disabled = false; }
}
init();
