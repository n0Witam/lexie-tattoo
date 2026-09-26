import { lstat, unlink } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { imagePath, PORTFOLIO_BASE } from '../assets/js/portfolio-data.js';

// Only explicit deletion requests are eligible, never all excluded/unindexed files.
export async function planPhotoDeletions(data, directory) {
  const root = resolve(directory);
  const active = new Set(data.items.map(item => imagePath(item.src)));
  const files = [], absent = [], retained = [], seen = new Set();
  for (const src of data.deletedSources || []) {
    const url = new URL(src, PORTFOLIO_BASE), path = imagePath(src);
    if (url.origin !== new URL(PORTFOLIO_BASE).origin || url.search || url.hash || !path.startsWith('/assets/img/portfolio/')) {
      throw new Error(`Usuwanie dozwolone tylko w assets/img/portfolio: ${src}`);
    }
    const parts = path.slice('/assets/img/portfolio/'.length).split('/');
    if (parts.some(part => !part || part.startsWith('.') || /[\\\x00-\x1f]/.test(part)) || !/\.(jpe?g|png|webp|avif|gif)$/i.test(path)) {
      throw new Error(`Nieprawidłowa ścieżka zdjęcia do usunięcia: ${src}`);
    }
    if (seen.has(path)) continue;
    seen.add(path);
    if (active.has(path)) { retained.push(src); continue; }
    const target = resolve(root, ...parts), rel = relative(root, target);
    if (!rel || rel.startsWith(`..${sep}`) || rel === '..') throw new Error(`Ścieżka poza katalogiem portfolio: ${src}`);
    let missing = false;
    // Reject symlinks at every level, including the root itself.
    for (let i = 0; i <= parts.length; i++) {
      const node = resolve(root, ...parts.slice(0, i));
      try {
        const stat = await lstat(node);
        if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) {
          throw new Error(`To nie jest zwykły plik zdjęcia/katalog: ${src}`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') { missing = true; break; }
        throw error;
      }
    }
    if (missing) absent.push(src); else files.push({ src, path: target });
  }
  return { files, absent, retained };
}

export async function applyPhotoDeletions(data, plan) {
  for (const file of plan.files) {
    try { await unlink(file.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Active references win over stale deletion requests (e.g. a restored JSON).
  const retained = new Set(plan.retained.map(imagePath));
  if (data.excludedSources) data.excludedSources = data.excludedSources.filter(src => !retained.has(imagePath(src)));
  delete data.deletedSources;
}
