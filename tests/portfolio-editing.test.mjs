import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizePortfolio, removePortfolioItem, assignmentGroups } from '../assets/js/portfolio-data.js';
import { scanPortfolio } from '../assets/js/portfolio-index.js';
import { buildAlt, initialAltDetails } from '../assets/js/portfolio-alt.js';
import { planPhotoDeletions, applyPhotoDeletions } from '../scripts/portfolio-files.mjs';

const item = { id: 'rose', src: '../assets/img/portfolio/rose.jpg', alt: 'Stary opis', featured: true };
const fixture = () => normalizePortfolio({ items: [{ ...item }], groups: [{ id: 'wykonane-prace', name: 'Wykonane prace', items: ['rose'], categories: [] }], featuredOrder: ['rose'] });
const recipe = { mode: 'generated', kind: 'done', motif: 'róże i sztylet', style: 'blackwork', bodyPart: 'forearm' };

test('alt creator builds Polish descriptions and updates signatures when moving groups', () => {
  assert.equal(buildAlt(recipe), 'Tatuaż: róże i sztylet, styl blackwork, na przedramieniu – realizacja Lexie Tattoo Warszawa Mokotów');
  assert.equal(buildAlt(recipe, 'free'), 'Projekt tatuażu: róże i sztylet, styl blackwork – wolny wzór Lexie Tattoo Warszawa Mokotów');
  assert.equal(buildAlt({ ...recipe, motif: ' ' }), '');
  assert.equal(initialAltDetails(item, 'done').mode, 'manual');
  const data = fixture();
  data.items[0].altDetails = recipe;
  data.groups[2].items = [];
  data.groups[1].items = ['rose'];
  const updated = normalizePortfolio(data);
  assert.equal(updated.items[0].alt, buildAlt(recipe, 'free'));
  assert.equal(updated.items[0].altDetails.bodyPart, 'forearm');
  delete data.items[0].altDetails;
  assert.equal(normalizePortfolio(data).items[0].alt, 'Stary opis');
});

test('deletion removes all references and survives export without being reindexed', () => {
  const data = fixture(), before = structuredClone(data);
  data.groups[2].items = [];
  data.groups[2].categories.push({ id: 'flowers', name: 'Kwiaty', items: ['rose'] });
  assert.equal(removePortfolioItem(data, 'rose'), true);
  assert.equal(data.items.length, 0);
  assert.deepEqual(data.featuredOrder, []);
  assert.deepEqual(assignmentGroups(data).flatMap(group => group.items), []);
  assert.deepEqual(data.deletedSources, [item.src]);
  assert.deepEqual(data.excludedSources, [item.src]);
  const exported = normalizePortfolio(JSON.parse(JSON.stringify(data)));
  assert.equal(scanPortfolio(['rose.jpg'], exported).added.length, 0);
  assert.equal(scanPortfolio(['rose.jpg'], before).existing, 1);
  const shared = fixture(); shared.items.push({ ...item, id: 'second' });
  removePortfolioItem(shared, 'rose'); assert.equal(shared.deletedSources, undefined);
  removePortfolioItem(shared, 'second'); assert.deepEqual(shared.deletedSources, [item.src]);
  const external = fixture(); external.items[0].src = 'https://example.org/rose.jpg';
  removePortfolioItem(external, 'rose'); assert.equal(external.deletedSources, undefined);
});

test('file deletion only removes explicit local requests; active references and exclusions are retained', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lexie-delete-'));
  try {
    await mkdir(join(directory, 'nested'));
    for (const file of ['rose.jpg', 'active.jpg', 'excluded.jpg', 'nested/hash #.JPG']) await writeFile(join(directory, file), 'fixture');
    const data = { items: [{ id: 'active', src: '../assets/img/portfolio/active.jpg' }], deletedSources: [item.src, '../assets/img/portfolio/active.jpg', '../assets/img/portfolio/nested/hash%20%23.JPG', '../assets/img/portfolio/missing.jpg'], excludedSources: [item.src, '../assets/img/portfolio/active.jpg', '../assets/img/portfolio/excluded.jpg'] };
    const plan = await planPhotoDeletions(data, directory);
    assert.equal(plan.files.length, 2); assert.equal(plan.absent.length, 1); assert.equal(plan.retained.length, 1);
    await applyPhotoDeletions(data, plan);
    await assert.rejects(access(join(directory, 'rose.jpg')));
    await assert.rejects(access(join(directory, 'nested/hash #.JPG')));
    await access(join(directory, 'active.jpg')); await access(join(directory, 'excluded.jpg'));
    assert.equal(data.deletedSources, undefined);
    assert.ok(!data.excludedSources.includes('../assets/img/portfolio/active.jpg'));
    assert.equal((await planPhotoDeletions(data, directory)).files.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('deletion rejects traversal, non-images, outside paths, symlinks and directories before deleting anything', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'lexie-delete-invalid-'));
  try {
    const directory = join(temp, 'portfolio'); await mkdir(directory);
    await writeFile(join(directory, 'rose.jpg'), 'keep'); await writeFile(join(temp, 'outside.jpg'), 'keep');
    await symlink(join(temp, 'outside.jpg'), join(directory, 'link.jpg'));
    await symlink(temp, join(directory, 'linked-dir'));
    await mkdir(join(directory, 'folder.jpg'));
    for (const src of ['../assets/img/map.png', '../assets/img/portfolio/%2e%2e%2foutside.jpg', 'https://example.org/rose.jpg', '../assets/img/portfolio/a.txt', '../assets/img/portfolio/link.jpg', '../assets/img/portfolio/linked-dir/outside.jpg', '../assets/img/portfolio/folder.jpg']) {
      await assert.rejects(planPhotoDeletions({ items: [], deletedSources: [item.src, src] }, directory));
      await access(join(directory, 'rose.jpg')); await access(join(temp, 'outside.jpg'));
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('runner applies deletion only with explicit flags and repeat runs are idempotent', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'lexie-delete-cli-'));
  try {
    const directory = join(temp, 'portfolio'), jsonPath = join(temp, 'portfolio.json'); await mkdir(directory);
    await writeFile(join(directory, 'rose.jpg'), 'fixture');
    const data = fixture(); removePortfolioItem(data, 'rose');
    await writeFile(jsonPath, JSON.stringify(data));
    const run = (...args) => spawnSync(process.execPath, ['scripts/index-portfolio.mjs', '--dir', directory, '--data', jsonPath, ...args], { encoding: 'utf8' });
    assert.equal(run().status, 0); await access(join(directory, 'rose.jpg'));
    assert.equal(run('--delete-files').status, 1); await access(join(directory, 'rose.jpg'));
    assert.equal(run('--write').status, 0); await access(join(directory, 'rose.jpg'));
    assert.equal(run('--write', '--delete-files').status, 0); await assert.rejects(access(join(directory, 'rose.jpg')));
    const written = await readFile(jsonPath, 'utf8');
    assert.equal(JSON.parse(written).deletedSources, undefined);
    assert.equal(run('--write', '--delete-files').status, 0); assert.equal(await readFile(jsonPath, 'utf8'), written);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
