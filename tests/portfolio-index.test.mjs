import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanPortfolio, validatePortfolio } from '../assets/js/portfolio-index.js';

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
    assert.equal(run('--output', output, '--group', 'work').status, 0);
    const result = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(result.items[0], source.items[0]);
    assert.deepEqual(result.featuredOrder, source.featuredOrder);
    assert.deepEqual(result.customMetadata, source.customMetadata);
    assert.equal(result.groups[0].items.length, 2);
    assert.equal(run('--output', output, '--group', 'work').status, 1);
    assert.equal(run('--output', input, '--group', 'work').status, 1);
    assert.equal(await readFile(input, 'utf8'), original);
    const secondOutput = join(temp, 'output-again.json');
    const repeat = spawnSync(process.execPath, ['scripts/index-portfolio.mjs', '--dir', directory, '--data', output, '--output', secondOutput, '--group', 'work'], { encoding: 'utf8' });
    assert.equal(repeat.status, 0, repeat.stderr || String(repeat.error));
    assert.deepEqual(JSON.parse(await readFile(secondOutput, 'utf8')).items, result.items);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
