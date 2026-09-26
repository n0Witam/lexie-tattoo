import { qs, el } from './util.js';
import { STYLES, BODY_PARTS, buildAlt, initialAltDetails } from './portfolio-alt.js';

// Native SVG: editable, sharp at any scale, and keyboard-accessible.
const REGIONS = [
  ['neck', 'M48 28h14v12H48z', 'front'],
  ['shoulder', 'M39 37l-13 7-7 12 14 5 8-13z M71 37l13 7 7 12-14 5-8-13z', 'front'],
  ['upper-arm', 'M19 57l14 5-4 30-16-4z M91 57l-14 5 4 30 16-4z', 'front'],
  ['forearm', 'M13 90l16 4-6 29-14-3z M97 90l-16 4 6 29 14-3z', 'front'],
  ['hand', 'M9 122l14 3-1 21-7 8-10-5z M101 122l-14 3 1 21 7 8 10-5z', 'front'],
  ['chest', 'M40 40h30l5 9-5 24H40l-5-24z', 'front'],
  ['ribs', 'M35 72l9 4v30h-9z M75 72l-9 4v30h9z', 'front'],
  ['abdomen', 'M46 76h18v31l7 12H39l7-12z', 'front'],
  ['thigh', 'M37 121h17l-2 44H32z M56 121h17l5 44H58z', 'front'],
  ['knee', 'M32 167h20v14H32z M58 167h20v14H58z', 'front'],
  ['calf', 'M32 183h20l-3 40H35z M58 183h20l-3 40H61z', 'front'],
  ['foot', 'M35 225h14v14H26v-7z M61 225h14l9 7v7H61z', 'front'],
  ['back', 'M39 40h32l7 12-6 50 4 19H34l4-19-6-50z', 'back'],
];
const NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
export function setupAltEditor({ onSave }) {
  const dialog = qs('#altDialog'), form = qs('#altForm');
  let current, details, opener;
  const kind = () => current.kind || qs('#altKind').value;
  const read = () => ({ mode: qs('#altMode').value, kind: kind(), motif: qs('#altMotif').value, style: qs('#altStyle').value, bodyPart: details.bodyPart });
  const generated = () => buildAlt(read());
  function selectBody(id) { details.bodyPart = id; update(); }
  for (const [id, name] of STYLES) qs('#altStyle').append(el('option', { value: id }, name));
  for (const [id, name] of [['', 'Nie określam'], ...BODY_PARTS]) {
    qs('#bodyOptions').append(el('button', { type: 'button', class: 'btn admin-body-option', dataset: { bodyPart: id }, 'aria-pressed': 'false', onclick: () => selectBody(id) }, name));
  }
  for (const view of ['front', 'back']) {
    const svg = svgNode('svg', { viewBox: '0 0 110 245', role: 'group', 'aria-label': view === 'front' ? 'Ciało — przód' : 'Ciało — tył' });
    svg.append(svgNode('circle', { cx: 55, cy: 17, r: 12, class: 'body-outline' }));
    svg.append(svgNode('path', { d: 'M48 29v7L27 43 20 56 13 90 8 122 5 150 15 155 23 145 24 122 30 96 35 74 36 106 33 120 31 165 33 182 35 225 26 234v7h24l2-58 3-49 3 49 2 58h24v-7l-9-9 2-43 2-17-2-45-3-14 1-32 5 22 6 26 1 23 8 10 10-5-3-28-5-32-7-34-7-13-21-7v-7', class: 'body-outline' }));
    for (const [id, d, regionView] of REGIONS.filter(region => region[2] === view)) {
      const name = BODY_PARTS.find(part => part[0] === id)[1];
      const region = svgNode('path', { d, class: 'body-region', tabindex: '0', role: 'button', 'aria-label': name, 'aria-pressed': 'false', 'data-body-part': id });
      const title = svgNode('title'); title.textContent = name; region.append(title);
      region.addEventListener('click', () => selectBody(id));
      region.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectBody(id); }
      });
      svg.append(region);
    }
    qs('#bodyMap').append(el('div', {}, svg, el('span', {}, view === 'front' ? 'Przód' : 'Tył')));
  }
  function update() {
    const isBuilder = qs('#altMode').value === 'generated';
    qs('#altBuilder').hidden = !isBuilder;
    qs('#altManualLabel').hidden = isBuilder;
    qs('#altMotif').required = isBuilder;
    qs('#altKindLabel').hidden = !!current.kind;
    qs('#altBody').hidden = kind() !== 'done';
    qs('#altPreview').textContent = (isBuilder ? generated() : qs('#altManual').value) || 'Uzupełnij motyw, aby zobaczyć opis.';
    dialog.querySelectorAll('[data-body-part]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.bodyPart === details.bodyPart)));
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  const close = () => dialog.close();
  ['#altClose', '#altCancel'].forEach(selector => qs(selector).addEventListener('click', close));
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => (qs(`[data-item-id="${CSS.escape(current.item.id)}"] .admin-edit-alt`) || opener)?.focus({ preventScroll: true }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const recipe = read();
    if (recipe.mode === 'generated' && !recipe.motif.trim()) { qs('#altMotif').focus(); return; }
    const alt = recipe.mode === 'generated' ? generated() : qs('#altManual').value.trim();
    onSave(current.item.id, alt, recipe);
    close();
  });
  return ({ item, kind: itemKind, src }) => {
    current = { item, kind: itemKind }; opener = document.activeElement;
    details = initialAltDetails(item, itemKind);
    qs('#altPhoto').src = src; qs('#altPhoto').alt = item.alt || 'Podgląd pracy';
    qs('#altFileName').textContent = decodeURIComponent(new URL(src, location.href).pathname.split('/').pop());
    qs('#altMode').value = details.mode; qs('#altKind').value = details.kind;
    qs('#altMotif').value = details.motif; qs('#altStyle').value = details.style;
    qs('#altManual').value = item.alt || '';
    update(); dialog.showModal();
  };
}
