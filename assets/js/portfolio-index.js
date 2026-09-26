// Shared by the browser editor and the local Node indexer. No filesystem access here.
export const PORTFOLIO_BASE = 'https://portfolio.local/data/portfolio.json';
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|avif|gif)$/i;

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
  if (data.groups != null && (!Array.isArray(data.groups) || data.groups.some(g =>
    !g || typeof g.id !== 'string' || typeof g.name !== 'string' || !Array.isArray(g.items ?? g.ids) ||
    (g.items ?? g.ids).some(id => typeof id !== 'string')))) throw new Error('Nieprawidłowe grupy w pliku.');
  if (new Set((data.groups || []).map(g => g.id)).size !== (data.groups || []).length) throw new Error('Grupy muszą mieć niepowtarzalne ID.');
  if (data.featuredOrder != null && (!Array.isArray(data.featuredOrder) || data.featuredOrder.some(id => typeof id !== 'string'))) throw new Error('Nieprawidłowa kolejność karuzeli.');
  return data;
}

export function scanPortfolio(paths, data) {
  validatePortfolio(data);
  const indexed = new Set(data.items.map(item => imagePath(item.src)));
  const ids = new Set(data.items.map(item => item.id));
  const seen = new Set();
  const added = [];
  let existing = 0, skipped = 0;
  for (const path of [...paths].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const parts = path.split('/');
    if (parts.some(p => !p || p.startsWith('.') || p.includes('\\')) || !IMAGE_EXTENSION.test(path)) {
      skipped++;
      continue;
    }
    const canonical = `/assets/img/portfolio/${path}`;
    if (seen.has(canonical)) { skipped++; continue; }
    seen.add(canonical);
    if (indexed.has(canonical)) { existing++; continue; }
    const stem = path.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const baseId = `p_${stem || 'zdjecie'}`;
    let id = baseId, suffix = 2;
    while (ids.has(id)) id = `${baseId}_${suffix++}`;
    ids.add(id);
    added.push({ id, src: `../assets/img/portfolio/${parts.map(encodeURIComponent).join('/')}`, alt: '', featured: false });
  }
  const missing = data.items.filter(item => {
    const path = imagePath(item.src);
    return path.startsWith('/assets/img/portfolio/') && !seen.has(path);
  }).map(item => item.src);
  return { added, existing, skipped, missing };
}
