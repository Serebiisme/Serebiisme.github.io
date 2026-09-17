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
const pruner = join(repositoryRoot, 'scripts', 'prune-ai-agent-book.mjs');
const provenanceWriter = join(
  repositoryRoot,
  'scripts',
  'write-course-provenance.mjs',
);
const supplementalAssetPreparer = join(
  repositoryRoot,
  'scripts',
  'prepare-supplemental-assets.mjs',
);
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

test('supplemental static paths are self-contained for Astro extraction', async () => {
  const route = await readFile(
    join(
      repositoryRoot,
      'overlays',
      'ai-agent-book',
      'src',
      'pages',
      '[supplement].astro',
    ),
    'utf8',
  );

  assert.match(route, /export function getStaticPaths\(\) \{\s*return \[/);
  for (const slug of ['introduction', 'afterword', 'reference-answers']) {
    assert.match(route, new RegExp(`slug: '${slug}'`));
  }
});

test('course header links to the canonical Labs learning area', async () => {
  const header = await readFile(
    join(
      repositoryRoot,
      'overlays',
      'ai-agent-book',
      'src',
      'components',
      'Header.astro',
    ),
    'utf8',
  );

  assert.match(header, /href="https:\/\/serebiisme\.github\.io\/learn\/"/);
  assert.doesNotMatch(header, /href="\/learn\/"/);
});

test('edition pruning removes only unselected configured source directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-prune-'));
  const source = join(root, 'source');
  const originalEditions = join(root, 'original-editions.json');
  const selectedEditions = join(root, 'selected-editions.json');
  await write(join(source, 'book', 'chapter1.md'), '简体中文');
  await write(join(source, 'book-en', 'chapter1.md'), 'English');
  await write(join(source, 'book-ja', 'chapter1.ja.md'), '日本語');
  await write(join(source, 'book-not-an-edition', 'keep.txt'), 'keep me');
  await write(
    originalEditions,
    JSON.stringify({
      en: { directory: 'book-en' },
      'zh-CN': { directory: 'book' },
      ja: { directory: 'book-ja' },
    }),
  );
  await write(
    selectedEditions,
    JSON.stringify({ 'zh-CN': { directory: 'book' } }),
  );

  const result = spawnSync(
    process.execPath,
    [pruner, source, originalEditions, selectedEditions],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  await access(join(source, 'book', 'chapter1.md'));
  await assert.rejects(access(join(source, 'book-en')));
  await assert.rejects(access(join(source, 'book-ja')));
  assert.equal(
    await readFile(join(source, 'book-not-an-edition', 'keep.txt'), 'utf8'),
    'keep me',
  );
});

test('provenance can be generated before deployment link validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-provenance-'));
  const target = join(root, 'dist', 'SOURCE.md');

  const result = spawnSync(
    process.execPath,
    [provenanceWriter, target, sourceCommit, sourceDate],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(target, 'utf8');
  assert.match(source, /https:\/\/github\.com\/bojieli\/ai-agent-book/);
  assert.match(source, new RegExp(sourceCommit));
  assert.match(source, /Apache License 2\.0/);
});

test('supplemental figures are prepared as original and themed local assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-supplemental-assets-'));
  const source = join(root, 'source');
  const publicRoot = join(root, 'public');
  await write(
    join(source, 'book', 'introduction.md'),
    '![one](images/fig0-1.svg)\n![two](images/fig0-2.svg)',
  );
  await write(join(source, 'book', 'afterword.md'), 'No images');
  await write(join(source, 'book', 'reference-answers.md'), 'No images');
  await write(join(source, 'book', 'images', 'fig0-1.svg'), '<svg>one</svg>');
  await write(join(source, 'book', 'images', 'fig0-2.svg'), '<svg>two</svg>');

  const result = spawnSync(
    process.execPath,
    [supplementalAssetPreparer, source, publicRoot],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(join(publicRoot, 'book', 'images', 'fig0-1.svg'), 'utf8'),
    '<svg>one</svg>',
  );
  for (const figure of ['fig0-1', 'fig0-2']) {
    for (const theme of ['light', 'dark']) {
      await access(
        join(publicRoot, 'figures', 'book', 'book', `${figure}-${theme}.svg`),
      );
    }
  }
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
