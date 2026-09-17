import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const repositoryRoot = resolve(new URL('..', import.meta.url).pathname);
const courseRoot = join(repositoryRoot, 'learn', 'ai-agent-book');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

test('root page exposes AI 学习 in navigation and the first card', async () => {
  const html = await read('index.html');
  assert.match(html, /<a href="\/learn\/">AI 学习<\/a>/);
  assert.match(html, /<a class="card card-large" href="\/learn\/">/);
  assert.match(html, /<strong>01<\/strong>/);
});

test('course library has accessible PWA and rendering hooks', async () => {
  const html = await read('learn/index.html');
  assert.match(html, /<title>AI 学习 · Serebii Labs<\/title>/);
  assert.match(
    html,
    /rel="manifest" href="\/learn\/manifest\.webmanifest"/,
  );
  assert.match(html, /id="course-grid"/);
  assert.match(html, /id="course-card-template"/);
  assert.match(html, /src="\/learn\/app\.js"/);
  assert.match(html, /课程版权归原作者/);
});

test('generated course includes the complete Chinese reading sequence', async () => {
  const required = [
    'index.html',
    'introduction/index.html',
    ...Array.from({ length: 10 }, (_, index) =>
      `book/chapter${index + 1}/index.html`),
    'afterword/index.html',
    'reference-answers/index.html',
    'LICENSE.txt',
    'SOURCE.md',
    'offline-manifest.json',
  ];
  for (const path of required) {
    await readFile(join(courseRoot, path));
  }
});

test('offline manifest includes every generated course file exactly once', async () => {
  const files = (await walk(courseRoot))
    .map((path) => relative(courseRoot, path).split(sep).join('/'))
    .filter((path) => path !== 'offline-manifest.json')
    .map((path) => `/learn/ai-agent-book/${path}`)
    .sort();
  const manifest = JSON.parse(
    await readFile(join(courseRoot, 'offline-manifest.json'), 'utf8'),
  );
  assert.deepEqual([...manifest.assets].sort(), files);
  assert.equal(new Set(manifest.assets).size, manifest.assets.length);
});

test('generated runtime assets stay under the same course origin', async () => {
  const files = await walk(courseRoot);
  const generated = files.filter((path) => /\.(?:html|css)$/.test(path));

  for (const path of generated) {
    const contents = await readFile(path, 'utf8');
    for (const [tag] of contents.matchAll(/<(?:script|img|source)\b[^>]*>/gi)) {
      assert.doesNotMatch(
        tag,
        /\b(?:src|srcset)="https?:\/\//i,
        relative(courseRoot, path),
      );
    }
    for (const [tag] of contents.matchAll(/<link\b[^>]*>/gi)) {
      if (!/\brel="[^"]*(?:stylesheet|icon|preload|modulepreload|manifest)[^"]*"/i.test(tag)) continue;
      assert.doesNotMatch(
        tag,
        /\bhref="https?:\/\//i,
        relative(courseRoot, path),
      );
    }
    assert.doesNotMatch(contents, /url\(["']?https?:\/\//i, relative(courseRoot, path));
  }
});
