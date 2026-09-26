import { fetchJSON, qs, el } from './util.js';
import { validatePortfolio, scanPortfolio, imagePath } from './portfolio-index.js';

const DATA_URL = new URL('../../data/portfolio.json', import.meta.url);
const DRAFT_KEY = 'lexie-portfolio-draft-v1';
const FREE_ID = 'wolne-wzory';
const clone = value => structuredClone(value);
const uid = () => `g_${crypto.randomUUID()}`;
const fileName = item => decodeURIComponent(new URL(item.src, DATA_URL).pathname.split('/').pop());
let state, published, draft, history = [], drag = null, candidates = [], search = '';
const localImages = new Map();
const collapsed = new Set();
const status = qs('#status');

function normalize(input) {
  const data = clone(validatePortfolio(input));
  data.groups = data.groups || [];
  let free = data.groups.find(g => g.name.trim().toLowerCase() === 'wolne wzory');
  if (!free) {
    let id = FREE_ID;
    while (data.groups.some(g => g.id === id)) id += '-new';
    free = { id, name: 'Wolne wzory', items: [] };
  }
  data.groups = [free, ...data.groups.filter(g => g !== free)];
  const all = new Set(data.items.map(item => item.id)), assigned = new Set();
  for (const group of data.groups) {
    group.items = (group.items || group.ids || []).filter(id => {
      if (!all.has(id) || assigned.has(id)) return false;
      assigned.add(id); return true;
    });
    delete group.ids;
  }
  const unassigned = [...all].filter(id => !assigned.has(id));
  if (unassigned.length) data.groups.push({ id: uid(), name: 'Do uporządkowania', items: unassigned });
  const featured = new Set(data.items.filter(item => item.featured).map(item => item.id));
  data.featuredOrder = [...new Set([...(data.featuredOrder || []), ...featured])].filter(id => featured.has(id));
  return data;
}

function output() {
  const byId = new Map(state.items.map(item => [item.id, item]));
  return { ...state, version: Math.max(Number(state.version) || 1, 2), updated: new Date().toISOString().slice(0, 10),
    items: state.groups.flatMap(group => group.items.map(id => byId.get(id))) };
}

function saveDraft(message) {
  // Keep an older draft available until the user explicitly restores/discards it.
  if (draft) { status.textContent = `${message} Pobierz JSON; starsza kopia robocza czeka na decyzję powyżej.`; return; }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: state, savedAt: Date.now() }));
    status.textContent = `${message} Kopia robocza zapisana w tej przeglądarce.`;
  } catch { status.textContent = `${message} Kopia lokalna niedostępna — pobierz JSON, aby zachować zmiany.`; }
}

function change(mutator, message, { render = true } = {}) {
  history.push(clone(state));
  if (history.length > 30) history.shift();
  mutator();
  if (render) renderAll(); else refreshStats();
  saveDraft(message);
}

function button(text, label, action, disabled = false) {
  return el('button', { type: 'button', class: 'btn icon-button', 'aria-label': label, title: label, disabled: disabled ? '' : null, onclick: action }, text);
}
function itemById(id) { return state.items.find(item => item.id === id); }
function groupOf(id) { return state.groups.find(group => group.items.includes(id)); }
function preview(item) { return localImages.get(imagePath(item.src)) || new URL(item.src, DATA_URL).href; }
function image(item) {
  return el('img', { src: preview(item), alt: item.alt || fileName(item), loading: 'lazy', draggable: 'false' });
}
function swap(array, id, direction) {
  const from = array.indexOf(id), to = from + direction;
  if (from < 0 || to < 0 || to >= array.length) return;
  [array[from], array[to]] = [array[to], array[from]];
}
function preserveFocus(action, selector) {
  action();
  qs(selector)?.focus({ preventScroll: true });
}
function moveFeatured(id, direction) {
  preserveFocus(() => change(() => swap(state.featuredOrder, id, direction), 'Zmieniono kolejność karuzeli.'), `[data-featured-id="${CSS.escape(id)}"]`);
}
function toggleFeatured(id) {
  change(() => {
    const item = itemById(id);
    item.featured = !item.featured;
    state.featuredOrder = state.featuredOrder.filter(value => value !== id);
    if (item.featured) state.featuredOrder.push(id);
  }, 'Zmieniono skład karuzeli.');
}

function refreshStats() {
  qs('#itemCount').textContent = state.items.length;
  qs('#featuredCount').textContent = state.featuredOrder.length;
  qs('#altCount').textContent = state.items.filter(item => !item.alt?.trim()).length;
  qs('#btnUndo').disabled = !history.length;
  ['#btnDownload', '#btnCopy', '#btnScan', '#btnAddGroup'].forEach(selector => qs(selector).disabled = false);
}

function renderCarousel() {
  const root = qs('#featuredList'), scroll = root.scrollLeft;
  root.replaceChildren();
  state.featuredOrder.forEach((id, index) => {
    const item = itemById(id);
    const card = el('article', { class: 'admin-featured', tabindex: '0', draggable: 'true', dataset: { featuredId: id }, 'aria-label': `Pozycja ${index + 1}: ${fileName(item)}` },
      image(item), el('div', { class: 'admin-featured-meta' },
        el('div', { class: 'admin-featured-title' }, el('span', { class: 'admin-position' }, String(index + 1).padStart(2, '0')), el('span', { class: 'admin-filename', title: fileName(item) }, fileName(item))),
        el('small', {}, groupOf(id)?.name),
        el('div', { class: 'admin-card-actions' },
          button('←', 'Przesuń w lewo', () => moveFeatured(id, -1), index === 0),
          button('→', 'Przesuń w prawo', () => moveFeatured(id, 1), index === state.featuredOrder.length - 1),
          button('×', 'Usuń z karuzeli', () => toggleFeatured(id)))));
    card.addEventListener('keydown', event => {
      if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); moveFeatured(id, event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    draggable(card, { type: 'featured', id });
    root.append(card);
  });
  if (!state.featuredOrder.length) root.append(el('p', { class: 'admin-empty' }, 'Karuzela jest pusta. Zaznacz „W karuzeli” przy wybranych pracach poniżej.'));
  root.scrollLeft = scroll;
}

function groupSelect(value, action) {
  const select = el('select', { 'aria-label': 'Grupa pracy', onchange: event => action(event.target.value) });
  for (const group of state.groups) select.append(el('option', { value: group.id }, group.name));
  select.value = value;
  return select;
}
function moveItem(id, targetGroup) {
  change(() => {
    const source = groupOf(id);
    source.items = source.items.filter(value => value !== id);
    state.groups.find(group => group.id === targetGroup).items.push(id);
    collapsed.delete(targetGroup);
  }, 'Przeniesiono pracę do grupy.');
}
function moveWithinGroup(id, direction) {
  preserveFocus(() => change(() => swap(groupOf(id).items, id, direction), 'Zmieniono kolejność prac.'), `[data-item-id="${CSS.escape(id)}"]`);
}
function renderItem(id, group) {
  const item = itemById(id), index = group.items.indexOf(id);
  const input = el('input', { type: 'text', value: item.alt || '', placeholder: 'Opisz to, co widać na zdjęciu…', onchange: event => {
    const alt = event.target.value;
    change(() => item.alt = alt, 'Zapisano opis zdjęcia.', { render: false });
  } });
  const row = el('article', { class: 'admin-item', tabindex: '0', draggable: search ? 'false' : 'true', dataset: { itemId: id } },
    image(item), el('div', { class: 'admin-item-meta' }, el('div', { class: 'admin-filename', title: `${fileName(item)} · ${id}` }, fileName(item)), el('label', {}, 'Opis zdjęcia (alt)', input)),
    el('div', { class: 'admin-item-controls' },
      el('label', { class: 'admin-check' }, el('input', { type: 'checkbox', checked: item.featured ? '' : null, onchange: () => toggleFeatured(id) }), 'W karuzeli'),
      button('↑', 'Przesuń pracę wyżej', () => moveWithinGroup(id, -1), index === 0 || !!search),
      button('↓', 'Przesuń pracę niżej', () => moveWithinGroup(id, 1), index === group.items.length - 1 || !!search),
      el('label', { class: 'admin-target' }, 'Grupa', groupSelect(group.id, target => moveItem(id, target)))));
  draggable(row, { type: 'item', id });
  row.addEventListener('keydown', event => {
    if (!search && event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); moveWithinGroup(id, event.key === 'ArrowUp' ? -1 : 1);
    }
  });
  return row;
}

function renderGroups() {
  const root = qs('#groupsList');
  root.replaceChildren();
  let found = 0;
  state.groups.forEach((group, index) => {
    const visible = group.items.filter(id => {
      const item = itemById(id);
      return `${id} ${fileName(item)} ${item.alt || ''}`.toLocaleLowerCase('pl').includes(search);
    });
    found += visible.length;
    if (search && !visible.length) return;
    const isCollapsed = collapsed.has(group.id) && !search;
    const name = el('input', { type: 'text', value: group.name, 'aria-label': 'Nazwa grupy', readonly: index === 0 ? '' : null, onchange: event => {
      const value = event.target.value.trim();
      if (!value || state.groups.some(g => g !== group && g.name.toLowerCase() === value.toLowerCase())) {
        event.target.value = group.name; status.textContent = 'Podaj niepustą, niepowtarzalną nazwę grupy.'; return;
      }
      change(() => group.name = value, 'Zmieniono nazwę grupy.');
    } });
    const controls = el('div', { class: 'admin-group-controls' });
    if (index > 0) {
      const moveGroup = direction => change(() => {
        [state.groups[index], state.groups[index + direction]] = [state.groups[index + direction], state.groups[index]];
      }, 'Zmieniono kolejność grup.');
      controls.append(button('↑', 'Przesuń grupę wyżej', () => moveGroup(-1), index === 1 || !!search), button('↓', 'Przesuń grupę niżej', () => moveGroup(1), index === state.groups.length - 1 || !!search));
      if (!group.items.length) controls.append(button('×', 'Usuń pustą grupę', () => change(() => state.groups.splice(index, 1), 'Usunięto pustą grupę.')));
    }
    const toggle = button(isCollapsed ? '+' : '−', isCollapsed ? 'Rozwiń grupę' : 'Zwiń grupę', () => {
      if (collapsed.has(group.id)) collapsed.delete(group.id); else collapsed.add(group.id);
      renderGroups();
    }, !!search);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    controls.append(toggle);
    const list = el('div', { class: 'admin-group-list', hidden: isCollapsed ? '' : null }, ...visible.map(id => renderItem(id, group)));
    if (!group.items.length) list.append(el('p', { class: 'admin-empty' }, 'Pusta grupa — przeciągnij tutaj pracę lub wybierz tę grupę przy zdjęciu.'));
    const section = el('section', { class: 'admin-group', dataset: { groupId: group.id }, 'aria-label': group.name },
      el('div', { class: 'admin-group-head' }, name, el('span', { class: 'admin-group-count' }, `${group.items.length} prac`), controls), list);
    section.addEventListener('dragover', event => {
      if (drag?.type !== 'item' || search) return;
      event.preventDefault(); section.classList.add('drop-target');
    });
    section.addEventListener('dragleave', event => { if (!section.contains(event.relatedTarget)) section.classList.remove('drop-target'); });
    section.addEventListener('drop', event => {
      if (drag?.type !== 'item' || search) return;
      event.preventDefault();
      const id = drag.id;
      const after = [...list.querySelectorAll('.admin-item')].find(row => row.dataset.itemId !== id && event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2)?.dataset.itemId;
      change(() => {
        const source = groupOf(id);
        source.items = source.items.filter(value => value !== id);
        group.items.splice(after ? group.items.indexOf(after) : group.items.length, 0, id);
        collapsed.delete(group.id);
      }, 'Zmieniono układ prac.');
      finishDrag();
    });
    root.append(section);
  });
  qs('#noResults').hidden = !search || found > 0;
}
function renderAll() {
  // Rendering after an edit must not strand keyboard users at the page start.
  const active = document.activeElement;
  const owner = active?.closest('[data-item-id], [data-featured-id], [data-group-id]');
  let focusTarget;
  if (owner && active !== owner) {
    const attribute = ['data-item-id', 'data-featured-id', 'data-group-id'].find(name => owner.hasAttribute(name));
    const controls = [...owner.querySelectorAll('button, input, select')];
    focusTarget = { selector: `[${attribute}="${CSS.escape(owner.getAttribute(attribute))}"]`, index: controls.indexOf(active) };
  }
  renderCarousel(); renderGroups(); refreshStats(); refreshImportGroups();
  if (focusTarget) qs(focusTarget.selector)?.querySelectorAll('button, input, select')[focusTarget.index]?.focus({ preventScroll: true });
}

function draggable(element, value) {
  element.addEventListener('dragstart', event => {
    if (event.target.closest('input, select, button') || (value.type === 'item' && search)) { event.preventDefault(); return; }
    drag = value;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', value.id);
    element.classList.add('dragging');
  });
  element.addEventListener('dragend', finishDrag);
}
function finishDrag() {
  drag = null;
  document.querySelectorAll('.dragging, .drop-target').forEach(node => node.classList.remove('dragging', 'drop-target'));
}
const carousel = qs('#featuredList');
carousel.addEventListener('dragover', event => {
  if (drag?.type !== 'featured') return;
  event.preventDefault();
  const rect = carousel.getBoundingClientRect();
  if (event.clientX < rect.left + 55) carousel.scrollLeft -= 24;
  if (event.clientX > rect.right - 55) carousel.scrollLeft += 24;
  carousel.classList.add('drop-target');
});
carousel.addEventListener('drop', event => {
  if (drag?.type !== 'featured') return;
  event.preventDefault();
  const id = drag.id;
  const after = [...carousel.children].find(card => card.dataset.featuredId !== id && event.clientX < card.getBoundingClientRect().left + card.offsetWidth / 2)?.dataset.featuredId;
  change(() => {
    state.featuredOrder = state.featuredOrder.filter(value => value !== id);
    state.featuredOrder.splice(after ? state.featuredOrder.indexOf(after) : state.featuredOrder.length, 0, id);
  }, 'Zmieniono kolejność karuzeli.');
  finishDrag();
});
for (const [selector, direction] of [['#carouselPrev', -1], ['#carouselNext', 1]]) {
  qs(selector).addEventListener('click', () => carousel.scrollBy({ left: direction * carousel.clientWidth * .75, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
}

function refreshImportGroups() {
  const select = qs('#importGroup'), previous = select.value;
  select.replaceChildren(...state.groups.map(group => el('option', { value: group.id }, group.name)));
  select.value = state.groups.some(group => group.id === previous) ? previous : (state.groups[1] || state.groups[0]).id;
}
function renderCandidates() {
  qs('#scanPanel').hidden = !candidates.length;
  qs('#scanList').replaceChildren(...candidates.map(candidate => el('label', { class: 'admin-candidate' },
    el('input', { type: 'checkbox', checked: candidate.selected ? '' : null, onchange: event => { candidate.selected = event.target.checked; refreshSelection(); } }), image(candidate.item), el('span', {}, fileName(candidate.item)))));
  refreshSelection();
}
function refreshSelection() {
  const count = candidates.filter(candidate => candidate.selected).length;
  qs('#btnImport').textContent = `Dodaj wybrane zdjęcia (${count})`;
  qs('#btnImport').disabled = !count;
  qs('#selectAll').checked = !!count && count === candidates.length;
  qs('#selectAll').indeterminate = !!count && count < candidates.length;
}
qs('#btnScan').addEventListener('click', () => qs('#folderInput').click());
qs('#folderInput').addEventListener('change', event => {
  const files = [...event.target.files];
  if (!files.length) return;
  const root = files[0].webkitRelativePath.split('/')[0];
  if (root !== 'portfolio') { qs('#scanStatus').textContent = 'Wybierz katalog o nazwie „portfolio” z assets/img, aby zachować poprawne ścieżki.'; event.target.value = ''; return; }
  const paths = files.map(file => file.webkitRelativePath.split('/').slice(1).join('/'));
  const result = scanPortfolio(paths, state);
  const filesByPath = new Map(files.map((file, i) => [paths[i], file]));
  for (const item of [...state.items, ...result.added]) {
    const path = imagePath(item.src), file = filesByPath.get(path.slice('/assets/img/portfolio/'.length));
    if (!file) continue;
    if (localImages.has(path)) URL.revokeObjectURL(localImages.get(path));
    localImages.set(path, URL.createObjectURL(file));
  }
  renderAll();
  candidates = result.added.map(item => ({ item, selected: true }));
  qs('#scanStatus').textContent = `Nowe: ${result.added.length}. Już w bibliotece: ${result.existing}. Pominięte pliki: ${result.skipped}.` + (result.missing.length ? ` Brakujące w wybranym katalogu: ${result.missing.length} — istniejące wpisy pozostają bez zmian.` : '');
  renderCandidates();
  event.target.value = '';
});
qs('#selectAll').addEventListener('change', event => { candidates.forEach(candidate => candidate.selected = event.target.checked); renderCandidates(); });
qs('#btnImport').addEventListener('click', () => {
  const selected = candidates.filter(candidate => candidate.selected);
  const target = state.groups.find(group => group.id === qs('#importGroup').value);
  if (!selected.length || !target) return;
  change(() => {
    // Rescan against current state so a restored draft cannot introduce duplicate IDs/paths.
    const paths = selected.map(candidate => imagePath(candidate.item.src).slice('/assets/img/portfolio/'.length));
    const fresh = scanPortfolio(paths, state).added;
    state.items.push(...fresh);
    target.items.push(...fresh.map(item => item.id));
    collapsed.delete(target.id);
  }, 'Dodano zdjęcia. Uzupełnij ich opisy przed publikacją.');
  candidates = candidates.filter(candidate => !candidate.selected);
  renderCandidates();
  qs('#scanStatus').textContent = 'Wybrane zdjęcia dodane do biblioteki. Pliki zdjęć także muszą trafić do assets/img/portfolio w repozytorium.';
});

qs('#search').addEventListener('input', event => { search = event.target.value.trim().toLocaleLowerCase('pl'); renderGroups(); });
qs('#btnAddGroup').addEventListener('click', () => {
  const id = uid();
  let name = 'Nowa grupa', count = 2;
  while (state.groups.some(group => group.name === name)) name = `Nowa grupa ${count++}`;
  search = ''; qs('#search').value = '';
  change(() => state.groups.push({ id, name, items: [] }), 'Dodano pustą grupę.');
  const input = qs(`[data-group-id="${CSS.escape(id)}"] input`);
  input?.focus(); input?.select();
});
qs('#btnUndo').addEventListener('click', () => {
  if (!history.length) return;
  state = history.pop(); renderAll(); saveDraft('Cofnięto ostatnią zmianę.');
});
qs('#btnDownload').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(output(), null, 2) + '\n'], { type: 'application/json' }));
  const link = el('a', { href: url, download: 'portfolio.json' });
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'Pobrano JSON. Podmień data/portfolio.json w repozytorium, aby opublikować zmiany.';
});
qs('#btnCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(output(), null, 2)); status.textContent = 'Skopiowano JSON do schowka.'; }
  catch { status.textContent = 'Schowek jest niedostępny. Użyj „Pobierz portfolio.json”.'; }
});
qs('#btnLoad').addEventListener('click', () => qs('#jsonInput').click());
qs('#jsonInput').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const loaded = normalize(JSON.parse(await file.text()));
    if (state) change(() => { state = loaded; }, 'Wczytano plik JSON.');
    else { state = loaded; renderAll(); saveDraft('Wczytano plik JSON.'); }
    candidates = []; renderCandidates();
  } catch (error) { status.textContent = `Nie udało się wczytać pliku: ${error.message}`; }
  event.target.value = '';
});
qs('#btnRestore').addEventListener('click', () => {
  if (!draft) return;
  const restored = draft; draft = null; qs('#draftNotice').hidden = true;
  if (state) change(() => { state = restored; }, 'Przywrócono kopię roboczą.');
  else { state = restored; renderAll(); saveDraft('Przywrócono kopię roboczą.'); }
  candidates = []; renderCandidates();
});
qs('#btnDiscard').addEventListener('click', () => {
  draft = null; qs('#draftNotice').hidden = true;
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be unavailable. */ }
  status.textContent = 'Odrzucono poprzednią kopię roboczą.';
  if (history.length) saveDraft('Zachowano bieżące zmiany.');
});

async function init() {
  try {
    const { data } = await fetchJSON(DATA_URL.href, { cache: 'no-store' });
    state = normalize(data); published = clone(state); renderAll();
    status.textContent = 'Wczytano dane ze strony. Zmiany publikujesz dopiero po podmianie pliku JSON.';
  } catch (error) { status.textContent = `Nie udało się wczytać portfolio. Możesz użyć „Wczytaj JSON”. ${error.message}`; }
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (stored?.data) {
      const saved = normalize(stored.data);
      if (JSON.stringify(saved) !== JSON.stringify(published)) {
        draft = saved; qs('#draftNotice').hidden = false;
      }
    }
  } catch { /* Invalid/unavailable drafts never block the published data. */ }
}
init();
