#!/usr/bin/env node
import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPortfolio } from '../assets/js/portfolio-index.js';
import { normalizePortfolio, GROUP_IDS } from '../assets/js/portfolio-data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {
    console.log('node scripts/index-portfolio.mjs [--write | --output /tmp/portfolio.json]\nBez opcji: tylko raport. Nowe zdjęcia zawsze trafiają do grupy Nowe.\n--write: uaktualnij wejściowy JSON (runner).\nOpcjonalnie: --dir katalog-zdjec --data plik-wejsciowy.json');
    process.exit(0);
  }
  if (args[i] === '--write') { options.write = true; continue; }
  if (!['--output', '--dir', '--data'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    console.error(`Nieprawidłowy argument: ${args[i]}. Użyj --help.`); process.exit(1);
  }
  options[args[i].slice(2)] = args[++i];
}

async function walk(directory, base = directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path, base));
    else if (entry.isFile()) paths.push(relative(base, path).split(sep).join('/'));
  }
  return paths;
}

try {
  if (options.write && options.output) throw new Error('Wybierz --write albo --output.');
  const dataPath = resolve(options.data || resolve(root, 'data/portfolio.json'));
  const directory = resolve(options.dir || resolve(root, 'assets/img/portfolio'));
  const original = JSON.parse(await readFile(dataPath, 'utf8'));
  const data = normalizePortfolio(original);
  const result = scanPortfolio(await walk(directory), data);
  console.log(`Nowe zdjęcia: ${result.added.length}; już w danych: ${result.existing}; pominięte: ${result.skipped}; brakujące: ${result.missing.length}.`);
  result.added.forEach(item => console.log(`+ ${item.src}`));
  result.missing.forEach(src => console.log(`? ${src} (wpis zachowany)`));
  data.groups.find(group => group.id === GROUP_IDS.NEW).items.push(...result.added.map(item => item.id));
  data.items.push(...result.added);
  const changed = JSON.stringify(data) !== JSON.stringify(original);
  if (changed) data.updated = new Date().toISOString().slice(0, 10);
  if (options.write && changed) {
    const temporary = `${dataPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, dataPath);
    console.log(`Uaktualniono ${dataPath}. Nowe zdjęcia czekają na przypisanie do galerii.`);
  } else if (options.output) {
    const output = resolve(options.output);
    if (output === dataPath || output === resolve(root, 'data/portfolio.json')) throw new Error('Do aktualizacji wejściowego pliku użyj --write.');
    await writeFile(output, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    console.log(`Zapisano ${output}.`);
  } else console.log(options.write ? 'Bez zmian — JSON nie wymaga zapisu.' : 'Tylko raport. Runner używa --write, aby uaktualnić dane.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
