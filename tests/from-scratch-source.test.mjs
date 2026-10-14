import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { importSources, verifyInventory, buildCatalog } from '../scripts/from-scratch/source.mjs';
import { temporarySource, fixtureFiles, translationFiles, sourceLock, archiveFetch, archive, revisions, expectedCounts } from './fixtures/from-scratch.mjs';

async function imported(t, en = fixtureFiles, zh = translationFiles, overrides) {
  const root = await temporarySource(t);
  const inventory = await importSources({ sourceLock, destination: root, fetchImpl: archiveFetch(en, zh, overrides) });
  return { root, inventory };
}
const catalogFor = (root, counts = expectedCounts) => buildCatalog({ sourceRoot: resolve(root, 'upstream/en'), translationRoot: resolve(root, 'upstream/zh'), expectedCounts: counts });

test('imports pinned text and code without executing it, and retains every lesson and existing quiz', async (t) => {
  const { root, inventory } = await imported(t);
  const catalog = await catalogFor(root);
  assert.equal(catalog.lessons.length, 2);
  assert.equal(catalog.phases.length, 1);
  assert.equal(catalog.projects.length, 1);
  assert.equal(catalog.quizzes.length, 1);
  assert.equal(catalog.lessons[0].titleEn, 'Introduction');
  assert.equal(catalog.lessons[0].titleZh, '入门草稿');
  assert.equal(catalog.lessons[1].quizPath, null);
  assert.deepEqual(catalog.projects[0].starterPaths, ['projects/demo/starter/main.py']);
  assert.deepEqual(catalog.projects[0].solutionPaths, ['projects/demo/solution/main.py']);
  assert.equal(existsSync(resolve(root, 'MUST_NOT_RUN')), false);
  assert.equal(await readFile(resolve(root, 'upstream/en/phases/00-foundation/01-intro/code/main.py'), 'utf8'), fixtureFiles['phases/00-foundation/01-intro/code/main.py']);
  await verifyInventory({ root, inventory });
});

test('detects changed imported bytes and never silently overwrites an immutable source', async (t) => {
  const { root, inventory } = await imported(t);
  await writeFile(resolve(root, 'upstream/en/LICENSE'), 'Changed');
  await assert.rejects(verifyInventory({ root, inventory }), /hash|size/i);
  await assert.rejects(importSources({ sourceLock, destination: root, fetchImpl: archiveFetch() }), /immutable/i);
  assert.equal(await readFile(resolve(root, 'upstream/en/LICENSE'), 'utf8'), 'Changed');
});

for (const path of ['../escape', '/absolute', 'phases/00-foundation/../escape']) {
  test(`rejects archive path traversal before writing any source: ${path}`, async (t) => {
    const root = await temporarySource(t);
    await assert.rejects(importSources({ sourceLock, destination: root, fetchImpl: archiveFetch({ ...fixtureFiles, [path]: 'unsafe' }) }), /path/i);
    assert.equal(existsSync(resolve(root, 'upstream/en/LICENSE')), false);
  });
}

test('rejects source symlinks in archives and inventory instead of following them', async (t) => {
  const root = await temporarySource(t);
  await assert.rejects(importSources({ sourceLock, destination: root, fetchImpl: archiveFetch(fixtureFiles, translationFiles, { LICENSE: { type: '2' } }) }), /link|type/i);
  const normal = await imported(t);
  const victim = resolve(normal.root, 'upstream/en/extra');
  await symlink('/tmp', victim);
  await assert.rejects(verifyInventory({ root: normal.root, inventory: { ...normal.inventory, files: [...normal.inventory.files, { path: 'upstream/en/extra/file', bytes: 0, sha256: '0'.repeat(64) }] } }), /link/i);
});

test('rejects missing lesson documents and incompatible pinned counts', async (t) => {
  const { root } = await imported(t);
  await assert.rejects(catalogFor(root, { ...expectedCounts, lessons: 3 }), /lessons/i);
  const incomplete = { ...fixtureFiles };
  delete incomplete['phases/00-foundation/01-intro/docs/en.md'];
  const other = await imported(t, incomplete);
  await assert.rejects(catalogFor(other.root), /missing.*en\.md/i);
});

test('rejects duplicate archive destinations and project IDs that disagree with their directory', async (t) => {
  const { root } = await imported(t, { ...fixtureFiles, 'projects/demo/project.json': JSON.stringify({ id: 'different', title: 'Wrong', stages: [] }) });
  await assert.rejects(catalogFor(root), /project.*id/i);
  await assert.rejects(verifyInventory({ root, inventory: { files: [{ path: 'a', bytes: 0, sha256: '0'.repeat(64) }, { path: 'a', bytes: 0, sha256: '0'.repeat(64) }] } }), /duplicate/i);
});

test('validates quiz answer indexes while preserving the untouched original JSON', async (t) => {
  const bad = { ...fixtureFiles, 'phases/00-foundation/01-intro/quiz.json': JSON.stringify({ questions: [{ question: 'Bad?', options: ['A', 'B'], correct: 2, explanation: 'Invalid index' }] }) };
  const { root } = await imported(t, bad);
  await assert.rejects(catalogFor(root), /quiz/i);
});

test('retains array-form upstream quizzes without converting the original file', async (t) => {
  const questions = JSON.parse(fixtureFiles['phases/00-foundation/01-intro/quiz.json']).questions;
  const original = JSON.stringify(questions);
  const { root } = await imported(t, { ...fixtureFiles, 'phases/00-foundation/01-intro/quiz.json': original });
  const catalog = await catalogFor(root);
  assert.equal(catalog.quizzes[0].questions, 1);
  assert.equal(await readFile(resolve(root, 'upstream/en/phases/00-foundation/01-intro/quiz.json'), 'utf8'), original);
});

test('rejects repeated archive names instead of overwriting their first contents', async (t) => {
  const root = await temporarySource(t);
  const fetchImpl = async (url) => url.includes(revisions.en)
    ? new Response(archive([...Object.entries(fixtureFiles), ['LICENSE', 'second copy']], revisions.en))
    : archiveFetch()(url);
  await assert.rejects(importSources({ sourceLock, destination: root, fetchImpl }), /duplicate/i);
  assert.equal(existsSync(resolve(root, 'upstream/en/LICENSE')), false);
});

test('does not import excluded certifications, other locales, or upstream installer skills', async (t) => {
  const { root } = await imported(t, { ...fixtureFiles, 'certifications/secret.md': 'out of scope', 'skills/learn/SKILL.md': 'do not follow' }, { ...translationFiles, 'i18n/ja/README.md': 'out of scope' });
  assert.equal(existsSync(resolve(root, 'upstream/en/certifications')), false);
  assert.equal(existsSync(resolve(root, 'upstream/en/skills')), false);
  assert.equal(existsSync(resolve(root, 'upstream/zh/i18n/ja')), false);
});

test('failed download leaves no partial source tree', async (t) => {
  const root = await temporarySource(t);
  await assert.rejects(importSources({ sourceLock, destination: root, fetchImpl: async () => new Response('not found', { status: 404 }) }), /404/);
  assert.equal(existsSync(resolve(root, 'upstream')), false);
});

test('records the upstream authoring template separately rather than presenting it as a ready project', async (t) => {
  const { root } = await imported(t, { ...fixtureFiles, 'projects/_template/project.json': JSON.stringify({ id: 'your-project-id', title: 'Your Project Title', status: 'draft', stages: [{ id: '01-first-stage' }] }) });
  const catalog = await catalogFor(root);
  assert.equal(catalog.projects.length, 1);
  assert.deepEqual(catalog.templates, ['projects/_template/project.json']);
});
