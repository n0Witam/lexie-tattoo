// Shared by the browser-compatible schema and the local Node indexer.
import { imagePath, validatePortfolio } from './portfolio-data.js';
export { imagePath, validatePortfolio } from './portfolio-data.js';
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|avif|gif)$/i;

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
