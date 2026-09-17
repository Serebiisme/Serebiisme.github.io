import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const courses = JSON.parse(
  await readFile(new URL('../learn/courses.json', import.meta.url)),
);

test('publishes exactly the real first course', () => {
  assert.equal(courses.length, 1);
  assert.deepEqual(courses[0], {
    id: 'ai-agent-book',
    title: '深入理解 AI Agent：设计原理与工程实践',
    author: 'Bojie Li',
    route: '/learn/ai-agent-book/',
    sourceRepository: 'https://github.com/bojieli/ai-agent-book',
    sourceCommit: 'c8963443736004412692b1af7706c89096d46e4e',
    license: 'Apache-2.0',
    chapterCount: 10,
    offlineManifest: '/learn/ai-agent-book/offline-manifest.json',
  });
});
