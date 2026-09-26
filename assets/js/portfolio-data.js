// Shared schema for the editor, indexer and public galleries.
export const GROUP_IDS = Object.freeze({ NEW: 'nowe', FREE: 'wolne-wzory', DONE: 'wykonane-prace' });
const MAIN_GROUPS = [
  { id: GROUP_IDS.NEW, name: 'Nowe' },
  { id: GROUP_IDS.FREE, name: 'Wolne wzory' },
  { id: GROUP_IDS.DONE, name: 'Wykonane prace' },
];
export const PORTFOLIO_BASE = 'https://portfolio.local/data/portfolio.json';

export function imagePath(src) {
  const url = new URL(src, PORTFOLIO_BASE);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Nieprawidłowy adres zdjęcia.');
  return url.origin === new URL(PORTFOLIO_BASE).origin ? decodeURIComponent(url.pathname) : url.href;
}

export function validatePortfolio(data) {
  if (!data || !Array.isArray(data.items)) throw new Error('Plik musi zawierać tablicę „items”.');
  const ids = new Set();
  for (const item of data.items) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) {
      throw new Error('Każda praca musi mieć niepowtarzalne tekstowe ID.');
    }
    if (typeof item.src !== 'string' || !item.src.trim()) throw new Error(`Brak adresu zdjęcia: ${item.id}`);
    imagePath(item.src);
    if (item.alt != null && typeof item.alt !== 'string') throw new Error(`Nieprawidłowy opis: ${item.id}`);
    ids.add(item.id);
  }
  const groupIds = new Set();
  function validateGroup(group, category = false) {
    if (!group || typeof group.id !== 'string' || !group.id.trim() || groupIds.has(group.id) ||
        typeof group.name !== 'string' || !Array.isArray(group.items ?? group.ids) ||
        (group.items ?? group.ids).some(id => typeof id !== 'string')) throw new Error('Nieprawidłowe lub powtórzone grupy/kategorie w pliku.');
    groupIds.add(group.id);
    if (group.categories != null) {
      if (category || !Array.isArray(group.categories)) throw new Error('Kategorie mogą mieć tylko jeden poziom.');
      group.categories.forEach(child => validateGroup(child, true));
    }
  }
  if (data.groups != null) {
    if (!Array.isArray(data.groups)) throw new Error('Nieprawidłowe grupy w pliku.');
    data.groups.forEach(group => validateGroup(group));
  }
  if (data.featuredOrder != null && (!Array.isArray(data.featuredOrder) || data.featuredOrder.some(id => typeof id !== 'string'))) throw new Error('Nieprawidłowa kolejność karuzeli.');
  return data;
}

export function assignmentGroups(data) {
  return data.groups.flatMap(group => [group, ...(group.categories || [])]);
}

export function normalizePortfolio(input) {
  const data = structuredClone(validatePortfolio(input));
  const legacy = data.groups || [];
  const used = new Set();
  const groups = MAIN_GROUPS.map(({ id, name }) => {
    const source = legacy.find(group => !used.has(group) && group.id === id) ||
      legacy.find(group => !used.has(group) && group.name.trim().toLocaleLowerCase('pl') === name.toLocaleLowerCase('pl'));
    if (source) used.add(source);
    return { ...source, id, name, items: [...(source?.items || source?.ids || [])] };
  });
  const [inbox, free, done] = groups;
  done.categories = [...(done.categories || [])];
  // Extra legacy groups become completed-work categories without losing their order.
  for (const group of legacy.filter(group => !used.has(group))) {
    done.categories.push({ ...group, items: [...(group.items || group.ids || [])], categories: undefined }, ...(group.categories || []));
  }
  // Nested data under other legacy roots is folded into that root, never dropped.
  for (const group of [inbox, free]) {
    for (const category of group.categories || []) group.items.push(...(category.items || category.ids || []));
    delete group.categories;
  }
  const takenIds = new Set(MAIN_GROUPS.map(group => group.id));
  for (const category of done.categories) {
    let id = category.id;
    while (takenIds.has(id)) id = `category-${id}`;
    category.id = id;
    takenIds.add(id);
    delete category.categories;
  }
  data.groups = groups;
  const all = new Set(data.items.map(item => item.id)), assigned = new Set();
  for (const group of assignmentGroups(data)) {
    group.items = (group.items || group.ids || []).filter(id => {
      if (!all.has(id) || assigned.has(id)) return false;
      assigned.add(id); return true;
    });
    delete group.ids;
  }
  inbox.items.push(...[...all].filter(id => !assigned.has(id)));
  const pending = new Set(inbox.items);
  for (const item of data.items) if (pending.has(item.id)) item.featured = false;
  const featured = new Set(data.items.filter(item => item.featured && !pending.has(item.id)).map(item => item.id));
  data.featuredOrder = [...new Set([...(data.featuredOrder || []), ...featured])].filter(id => featured.has(id));
  // The fixed groups are now the source of truth for publication status.
  delete data.freePatternIds;
  data.version = Math.max(Number(data.version) || 1, 6);
  return data;
}

export function galleryGroups(data, view = 'portfolio') {
  const normalized = normalizePortfolio(data);
  const group = normalized.groups.find(group => group.id === (view === 'available' ? GROUP_IDS.FREE : GROUP_IDS.DONE));
  return [group, ...(group.categories || [])];
}
