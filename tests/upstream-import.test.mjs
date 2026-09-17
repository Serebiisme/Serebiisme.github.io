import test from 'node:test';
import assert from 'node:assert/strict';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(new URL('..', import.meta.url).pathname);
const importer = join(repositoryRoot, 'scripts', 'import-ai-agent-book.mjs');
const sourceCommit = 'c8963443736004412692b1af7706c89096d46e4e';
const sourceDate = '2026-09-17T03:05:12Z';
const requiredPages = [
  'index.html',
  ...Array.from({ length: 10 }, (_, index) =>
    `book/chapter${index + 1}/index.html`),
  'introduction/index.html',
  'afterword/index.html',
  'reference-answers/index.html',
];

async function write(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function runImporter(dist, target, license) {
  return spawnSync(
    process.execPath,
    [importer, dist, target, license, sourceCommit, sourceDate],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
}

test('Chinese build configuration cannot emit other language editions', async () => {
  const editions = JSON.parse(
    await readFile(
      join(repositoryRoot, 'overlays', 'ai-agent-book', 'editions.json'),
      'utf8',
    ),
  );
  assert.deepEqual(Object.keys(editions), ['zh-CN']);
  assert.equal(editions['zh-CN'].directory, 'book');
  assert.equal(editions['zh-CN'].home, '/');
});

test('incomplete upstream build leaves the existing course untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-import-fail-'));
  const dist = join(root, 'dist');
  const target = join(root, 'course');
  const license = join(root, 'LICENSE');
  await write(join(dist, 'index.html'), 'incomplete');
  await write(join(target, 'sentinel.txt'), 'keep me');
  await write(license, 'Apache License 2.0');

  const result = runImporter(dist, target, license);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing required page/i);
  assert.equal(await readFile(join(target, 'sentinel.txt'), 'utf8'), 'keep me');
});

test('complete upstream build is imported with provenance and full manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-import-pass-'));
  const dist = join(root, 'dist');
  const target = join(root, 'course');
  const license = join(root, 'LICENSE');
  for (const page of requiredPages) {
    await write(join(dist, page), `<html><body>${page}</body></html>`);
  }
  await write(join(dist, '_astro', 'reader.css'), 'body{}');
  await write(license, 'Apache License 2.0');

  const result = runImporter(dist, target, license);

  assert.equal(result.status, 0, result.stderr);
  await access(join(target, 'book', 'chapter10', 'index.html'));
  assert.equal(await readFile(join(target, 'LICENSE.txt'), 'utf8'), 'Apache License 2.0');
  const source = await readFile(join(target, 'SOURCE.md'), 'utf8');
  assert.match(source, /https:\/\/github\.com\/bojieli\/ai-agent-book/);
  assert.match(source, new RegExp(sourceCommit));
  assert.match(source, /Chinese-only edition configuration/);
  assert.match(source, /supplemental routes/);

  const manifest = JSON.parse(
    await readFile(join(target, 'offline-manifest.json'), 'utf8'),
  );
  assert.equal(manifest.sourceCommit, sourceCommit);
  assert.ok(manifest.assets.includes('/learn/ai-agent-book/index.html'));
  assert.ok(
    manifest.assets.includes(
      '/learn/ai-agent-book/reference-answers/index.html',
    ),
  );
  assert.ok(manifest.assets.includes('/learn/ai-agent-book/LICENSE.txt'));
  assert.ok(manifest.assets.includes('/learn/ai-agent-book/SOURCE.md'));
  assert.ok(manifest.assets.includes('/learn/ai-agent-book/_astro/reader.css'));
});
