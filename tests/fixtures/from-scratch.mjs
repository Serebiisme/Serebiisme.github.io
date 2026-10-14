import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

export const revisions = { en: 'a'.repeat(40), zh: 'b'.repeat(40) };
export const phaseId = '00-foundation';
export const lessonId = `${phaseId}/01-intro`;
export const expectedCounts = { phases: 1, lessons: 2, quizzes: 1, projects: 1 };
export const fixtureFiles = {
  'phases/00-foundation/01-intro/docs/en.md': '# Introduction\n\nRead before running.\n',
  'phases/00-foundation/01-intro/code/main.py': 'open("MUST_NOT_RUN", "w").write("side effect")\n',
  'phases/00-foundation/01-intro/quiz.json': JSON.stringify({ questions: [{ question: 'Which value?', options: ['zero', 'one'], correct: 1, explanation: 'One is the second option.' }] }),
  'phases/00-foundation/02-next/docs/en.md': '# Next lesson\n\nNext.\n',
  'projects/demo/project.json': JSON.stringify({ id: 'demo', title: 'Demo project', stages: [{ id: '01-start' }] }),
  'projects/demo/README.md': '# Demo\n',
  'projects/demo/stages/01-start/docs/en.md': '# Start\n',
  'projects/demo/starter/main.py': 'raise NotImplementedError()\n',
  'projects/demo/solution/main.py': 'print(1)\n',
  'scripts/project_test.py': '# Grader, never run on import\n',
  'LICENSE': 'MIT License\nCopyright (c) 2026 Example\n',
};
export const translationFiles = {
  'i18n/zh/phases/00-foundation/01-intro/docs/zh.md': '# 入门草稿\n\n先阅读。\n',
  'i18n/zh/phases/00-foundation/02-next/docs/zh.md': '# 下一课\n',
};

export async function temporarySource(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'from-scratch-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
export async function writeFixture(root, files) {
  for (const [path, text] of (Array.isArray(files) ? files : Object.entries(files))) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}

// Hand-built standard tar fixture; no external archive tool or source code runs.
export function archive(files, revision, overrides = {}) {
  const chunks = [];
  for (const [path, text] of (Array.isArray(files) ? files : Object.entries(files))) {
    const data = Buffer.from(text);
    const header = Buffer.alloc(512);
    header.write(`course-${revision}/${path}`);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write(overrides[path]?.type ?? '0', 156);
    header.write('ustar\0', 257);
    const checksum = header.reduce((a, b) => a + b, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
export function archiveFetch(enFiles = fixtureFiles, zhFiles = translationFiles, overrides = {}) {
  return async (url) => {
    const revision = url.includes(revisions.en) ? revisions.en : revisions.zh;
    return new Response(archive(revision === revisions.en ? enFiles : zhFiles, revision, overrides));
  };
}
export const sourceLock = { repository: 'example/course', sourceCommit: revisions.en, translationCommit: revisions.zh, expectedCounts };
