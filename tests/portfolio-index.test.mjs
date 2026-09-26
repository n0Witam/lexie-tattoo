import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanPortfolio, validatePortfolio } from '../assets/js/portfolio-index.js';
import { GROUP_IDS, normalizePortfolio, assignmentGroups, galleryGroups } from '../assets/js/portfolio-data.js';

const source = {
  version: 5,
  customMetadata: { preserved: true },
  featuredOrder: ['original'],
  groups: [{ id: 'work', name: 'Wykonane prace', items: ['original'] }],
  items: [{ id: 'original', src: '../assets/img/portfolio/old%20photo.JPG', alt: 'Zachowany opis', featured: true, custom: 42 }],
};

test('indexing preserves existing data, skips duplicates, and encodes nested paths', () => {
  const before = structuredClone(source);
  const result = scanPortfolio(['old photo.JPG', 'new #1/nowy %.jpeg', 'new #1/nowy %.jpeg', 'notes.txt', '.hidden.jpg', '../bad.jpg'], source);
  assert.deepEqual(source, before);
  assert.equal(result.existing, 1);
  assert.equal(result.added.length, 1);
  assert.equal(result.skipped, 4);
  assert.equal(result.added[0].src, '../assets/img/portfolio/new%20%231/nowy%20%25.jpeg');
  assert.equal(result.added[0].featured, false);
  assert.equal(result.added[0].alt, '');
  assert.deepEqual(result.missing, []);
  const repeated = scanPortfolio(['old photo.JPG', 'new #1/nowy %.jpeg'], { ...source, items: [...source.items, ...result.added] });
  assert.equal(repeated.added.length, 0);
});

test('IDs remain unique across colliding names and existing IDs', () => {
  const data = { ...source, items: [...source.items, { id: 'p_a', src: '../assets/img/portfolio/else.jpg' }] };
  const paths = ['a.jpg', 'a.png', 'A.JPG', 'a/b.jpg', 'a-b.jpg'];
  const result = scanPortfolio(paths, data);
  assert.equal(new Set([...data.items, ...result.added].map(item => item.id)).size, 7);
  assert.deepEqual(scanPortfolio(paths.toReversed(), data).added, result.added);
  assert.equal(result.missing.length, 2);
});

test('validation rejects duplicate IDs, unsafe URLs and malformed groups', () => {
  assert.throws(() => validatePortfolio({ items: [source.items[0], source.items[0]] }), /ID/);
  assert.throws(() => validatePortfolio({ items: [{ id: 'bad', src: 'javascript:alert(1)' }] }), /adres/);
  assert.throws(() => validatePortfolio({ ...source, groups: [{ id: 'g', name: 'x', items: 'no' }] }), /grupy/);
});

test('CLI dry run and output preserve source files and metadata', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'lexie-index-test-'));
  try {
    const directory = join(temp, 'portfolio'), input = join(temp, 'input.json'), output = join(temp, 'output.json');
    await mkdir(directory);
    await writeFile(join(directory, 'new.JPG'), 'fixture');
    await writeFile(join(directory, 'old photo.JPG'), 'fixture');
    const original = JSON.stringify(source);
    await writeFile(input, original);
    const run = (...args) => spawnSync(process.execPath, ['scripts/index-portfolio.mjs', '--dir', directory, '--data', input, ...args], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(await readFile(input, 'utf8'), original);
    assert.equal(run('--output', output).status, 0);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(result.items[0], source.items[0]);
    assert.deepEqual(result.featuredOrder, source.featuredOrder);
    assert.deepEqual(result.customMetadata, source.customMetadata);
    assert.equal(result.groups[0].id, GROUP_IDS.NEW);
    assert.equal(result.groups[0].items.length, 1);
    assert.deepEqual(result.groups[2].items, source.groups[0].items);
    assert.equal(result.items[1].featured, false);
    assert.equal(run('--output', output).status, 1);
    assert.equal(run('--output', input).status, 1);
    assert.equal(await readFile(input, 'utf8'), original);
    const secondOutput = join(temp, 'output-again.json');
    const repeat = spawnSync(process.execPath, ['scripts/index-portfolio.mjs', '--dir', directory, '--data', output, '--output', secondOutput], { encoding: 'utf8' });
    assert.equal(repeat.status, 0, repeat.stderr || String(repeat.error));
    assert.deepEqual(JSON.parse(await readFile(secondOutput, 'utf8')).items, result.items);
    assert.equal(run('--write').status, 0);
    const written = await readFile(input, 'utf8');
    assert.equal(run('--write').status, 0);
    assert.equal(await readFile(input, 'utf8'), written);
    assert.equal(run('--write', '--output', output).status, 1);
  } finally { await rm(temp, { recursive: true, force: true }); }
});


test('migration creates exactly three immutable roots and retains legacy categories and metadata', () => {
  const legacy = {
    ...source,
    items: [...source.items, { id: 'free', src: '../assets/img/portfolio/free.jpg', alt: 'Projekt', featured: true }, { id: 'other', src: '../assets/img/portfolio/other.jpg' }, { id: 'orphan', src: '../assets/img/portfolio/orphan.jpg', featured: true }],
    groups: [
      { id: 'old-free', name: 'Wolne wzory', items: ['free'] },
      source.groups[0],
      { id: 'flowers', name: 'Kwiaty', items: ['other'], custom: 'retained' },
    ],
    featuredOrder: ['free', 'original', 'orphan'],
  };
  const migrated = normalizePortfolio(legacy);
  assert.deepEqual(migrated.groups.map(g => [g.id, g.name]), [['nowe', 'Nowe'], ['wolne-wzory', 'Wolne wzory'], ['wykonane-prace', 'Wykonane prace']]);
  assert.deepEqual(migrated.groups[2].categories[0], { id: 'flowers', name: 'Kwiaty', items: ['other'], custom: 'retained' });
  assert.deepEqual(migrated.groups[0].items, ['orphan']);
  assert.deepEqual(migrated.featuredOrder, ['free', 'original']);
  assert.deepEqual(migrated.items.find(item => item.id === 'original'), source.items[0]);
  assert.deepEqual(normalizePortfolio(migrated), migrated);
  assert.deepEqual(galleryGroups(migrated).flatMap(g => g.items), ['original', 'other']);
  assert.deepEqual(galleryGroups(migrated, 'available').flatMap(g => g.items), ['free']);
});

test('nested categories are retained across normalization, and pending items cannot be public or featured', () => {
  const data = normalizePortfolio(source);
  data.items.push({ id: 'pending', src: '../assets/img/portfolio/pending.jpg', featured: true });
  data.groups[0].items.push('pending');
  data.featuredOrder.unshift('pending');
  data.groups[2].items = [];
  data.groups[2].categories.push({ id: 'fine-line', name: 'Fine line', items: ['original'], custom: 10 });
  const normalized = normalizePortfolio(data);
  assert.equal(normalized.items.find(item => item.id === 'pending').featured, false);
  assert.deepEqual(normalized.featuredOrder, ['original']);
  assert.deepEqual(galleryGroups(data).flatMap(g => g.items), ['original']);
  assert.deepEqual(galleryGroups(data, 'available').flatMap(g => g.items), []);
  assert.equal(normalized.groups[2].categories[0].custom, 10);
  assert.equal(assignmentGroups(normalized).flatMap(g => g.items).length, data.items.length);
  const broken = structuredClone(data);
  broken.groups[2].categories[0].categories = [];
  assert.throws(() => validatePortfolio(broken), /jeden poziom/);
});
