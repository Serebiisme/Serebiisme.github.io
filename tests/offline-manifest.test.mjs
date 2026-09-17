import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectAssets,
  buildManifest,
} from '../scripts/generate-offline-manifest.mjs';

test('manifest catches omitted or unsorted course files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-manifest-'));
  await mkdir(join(root, 'book', 'chapter1'), { recursive: true });
  await writeFile(join(root, 'index.html'), 'home');
  await writeFile(join(root, 'book', 'chapter1', 'index.html'), 'chapter');
  await writeFile(join(root, 'offline-manifest.json'), 'old');

  assert.deepEqual(await collectAssets(root, '/learn/ai-agent-book/'), [
    '/learn/ai-agent-book/book/chapter1/index.html',
    '/learn/ai-agent-book/index.html',
  ]);
});

test('content changes produce a new deterministic version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-version-'));
  await writeFile(join(root, 'index.html'), 'first');

  const first = await buildManifest(root, '/learn/ai-agent-book/', 'abc');
  const repeat = await buildManifest(root, '/learn/ai-agent-book/', 'abc');
  assert.deepEqual(first, repeat);
  assert.match(first.version, /^[a-f0-9]{16}$/);

  await writeFile(join(root, 'index.html'), 'second');
  const changed = await buildManifest(root, '/learn/ai-agent-book/', 'abc');
  assert.notEqual(changed.version, first.version);
});

test('public prefix must be an absolute directory path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-prefix-'));
  await assert.rejects(
    collectAssets(root, 'learn/ai-agent-book'),
    /begin and end with a slash/,
  );
});
