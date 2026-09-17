import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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
