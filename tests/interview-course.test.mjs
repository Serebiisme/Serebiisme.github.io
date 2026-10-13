import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseBank } from '../scripts/import-interview-bank.mjs';
import { buildManifest } from '../scripts/generate-offline-manifest.mjs';
const root = resolve('learn/ai-engineering');
const read = (file) => readFile(resolve(root, file), 'utf8');
const bank = JSON.parse(await read('bank.json'));
const progress = JSON.parse(await read('progress.json'));

test('interview bank preserves every question and its source links from the licensed snapshot', async () => {
  const modules = parseBank(await read('upstream-README.md'));
  assert.deepEqual(bank.modules, modules);
  const ids = modules.flatMap((m) => m.questions.map((q) => q.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, progress.totalQuestions);
  assert.equal(modules.length, 14);
});

test('published progress counts actual translated explanations and exercises', async () => {
  let explanations = 0;
  let exercises = 0;
  for (const module of bank.modules) {
    const html = await read(`${module.id}/index.html`);
    assert.equal((html.match(/data-question /g) ?? []).length, module.questions.length);
    const count = (html.match(/<h3>原理与边界<\/h3>/g) ?? []).length;
    explanations += count;
    exercises += (html.match(/<h3>自测 \/ Try it<\/h3>/g) ?? []).length;
    assert.equal(progress.modules.find((m) => m.id === module.id).completed, count);
    for (const q of module.questions) assert.ok(html.includes(`id="${q.id}"`));
  }
  assert.equal(progress.translatedQuestions, explanations);
  assert.equal(progress.explainedQuestions, exercises);
  const articles = await read('articles/index.html');
  assert.equal((articles.match(/<article /g) ?? []).length, progress.articleNotes);
  assert.equal(progress.remainingArticles.length + progress.articleNotes, bank.articles.length);
  assert.equal(progress.complete, explanations === progress.totalQuestions && progress.articleNotes === bank.articles.length);
});

test('interview offline manifest hashes and includes all local files', async () => {
  const manifest = JSON.parse(await read('offline-manifest.json'));
  assert.deepEqual(manifest, await buildManifest(root, '/learn/ai-engineering/', bank.sourceCommit));
  const courses = JSON.parse(await readFile(resolve('learn/courses.json'), 'utf8'));
  const course = courses.find((c) => c.id === 'ai-engineering');
  assert.ok(course);
  assert.equal(course.sourceCommit, bank.sourceCommit);
  for (const path of ['index.html', 'articles/index.html', 'course.css', 'reader.js', 'SOURCE.md', 'LICENSE.txt']) {
    assert.ok(manifest.assets.includes(`/learn/ai-engineering/${path}`));
  }
});

test('course pages use same-origin runtime resources and valid local links', async () => {
  const pages = ['index.html', 'articles/index.html', ...bank.modules.map((m) => `${m.id}/index.html`)];
  for (const page of pages) {
    const html = await read(page);
    assert.doesNotMatch(html, /(?:src|href)="https?:[^\"]+"[^>]*(?:rel="stylesheet"|type="module")/);
    for (const match of html.matchAll(/(?:href|src)="(\/[^\"]+)"/g)) {
      const pathname = match[1].split('#')[0];
      await access(resolve('.' + pathname, pathname.endsWith('/') ? 'index.html' : ''));
    }
  }
});

test('public article notes cover unique real sources and expose a searchable offline shelf', async () => {
  const files = await import('node:fs/promises').then((fs) => fs.readdir(root));
  const notes = [...(await import('../learn/ai-engineering/article-notes.mjs')).default];
  for (const file of files.filter((f) => /^articles-.+\.mjs$/.test(f))) {
    notes.push(...(await import(new URL(`../learn/ai-engineering/${file}`, import.meta.url))).default);
  }
  assert.equal(new Set(notes.map((n) => n.slug)).size, notes.length);
  for (const note of notes) {
    assert.equal(bank.articles.filter((a) => a.url.endsWith('/' + note.slug)).length, 1);
    assert.ok(note.title && note.summary && note.extension);
  }
  const html = await read('articles/index.html');
  assert.match(html, /id="reading-search"/);
  assert.equal((html.match(/data-reading /g) ?? []).length, notes.length);
  const slugs = new Set(notes.map((n) => n.slug));
  for (const module of bank.modules) {
    const page = await read(`${module.id}/index.html`);
    for (const q of module.questions) {
      for (const source of q.sources) {
        const slug = new URL(source.url).pathname.split('/').at(-1);
        if (slugs.has(slug)) {
          const question = page.slice(page.indexOf(`id="${q.id}"`), page.indexOf('</details>', page.indexOf(`id="${q.id}"`)));
          assert.ok(question.includes(`/learn/ai-engineering/articles/#${slug}`), `${q.id} must link its local article ${slug}`);
        }
      }
    }
  }
});
