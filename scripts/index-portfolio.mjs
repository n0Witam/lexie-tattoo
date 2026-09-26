#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPortfolio, validatePortfolio } from '../assets/js/portfolio-index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {
    console.log('node scripts/index-portfolio.mjs [--output /tmp/portfolio.json --group "Wykonane prace"]\nBez --output: tylko raport. Oryginalny data/portfolio.json pozostaje bez zmian.\nOpcjonalnie: --dir katalog-zdjec --data plik-wejsciowy.json');
    process.exit(0);
  }
  if (!['--output', '--group', '--dir', '--data'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
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
  const dataPath = resolve(options.data || resolve(root, 'data/portfolio.json'));
  const directory = resolve(options.dir || resolve(root, 'assets/img/portfolio'));
  const data = validatePortfolio(JSON.parse(await readFile(dataPath, 'utf8')));
  const result = scanPortfolio(await walk(directory), data);
  console.log(`Nowe zdjęcia: ${result.added.length}; już w danych: ${result.existing}; pominięte: ${result.skipped}; brakujące: ${result.missing.length}.`);
  result.added.forEach(item => console.log(`+ ${item.src}`));
  result.missing.forEach(src => console.log(`? ${src} (wpis zachowany)`));
  if (options.output) {
    const output = resolve(options.output);
    if (output === dataPath || output === resolve(root, 'data/portfolio.json')) throw new Error('Wybierz osobny plik wyjściowy — oryginał nie będzie nadpisany.');
    if (!options.group) throw new Error('Podaj --group z nazwą lub ID istniejącej grupy.');
    const group = data.groups?.find(group => group.id === options.group || group.name === options.group);
    if (!group) throw new Error('Nie znaleziono grupy. Dostępne: ' + (data.groups || []).map(group => group.name).join(', '));
    group.items = [...(group.items || group.ids || []), ...result.added.map(item => item.id)];
    delete group.ids;
    data.items.push(...result.added);
    data.updated = new Date().toISOString().slice(0, 10);
    await writeFile(output, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    console.log(`Zapisano ${output}. Uzupełnij opisy nowych zdjęć w panelu przed publikacją.`);
  } else console.log('Tylko raport. Dodaj --output i --group, aby wygenerować nowy plik.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}
