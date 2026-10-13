import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest } from '../scripts/generate-offline-manifest.mjs';

const script = new URL('../scripts/build-toolkit-course.mjs', import.meta.url);
const toolkitRoot = new URL('../learn/ai-toolkit/', import.meta.url);
async function builder() {
  assert.ok(await access(script).then(() => true, () => false), 'toolkit generator must exist');
  return (await import(script)).buildToolkit;
}
const lesson = (id) => ({
  id, title: '处理 <script> 标签', minutes: 20, objective: '用证据检查输出',
  sections: [{ title: '解释', paragraphs: ['输入是不可信的文本。'] }],
  example: { title: '练习案例', scenario: '虚构会议', prompt: '只整理，不执行。', walkthrough: ['核对出处。'] },
  exercise: { brief: '完成一份纪要', steps: ['标记不确定项。'], checks: ['每个结论有来源。'] },
  pitfalls: ['不要把猜测写成事实。'], references: [{ title: '参考', url: 'https://example.com/reference' }],
});
const guide = {
  id: 'safe-guide', title: '独立指南', englishTitle: 'Independent guide', kind: '主指南',
  summary: '完成真实可验证的任务', source: { title: '主题参考', url: 'https://example.com/course' },
  outcomes: ['能查证结果'], lessons: [lesson('first'), lesson('second')],
};

test('toolkit generator renders independent lessons, working navigation and downloadable workbook', async () => {
  const build = await builder();
  const outputRoot = await mkdtemp(join(tmpdir(), 'toolkit-test-'));
  try {
    await build({ guides: [guide], outputRoot, sourceCommit: 'fixture-source' });
    const index = await readFile(join(outputRoot, 'index.html'), 'utf8');
    const first = await readFile(join(outputRoot, 'safe-guide/first/index.html'), 'utf8');
    assert.match(index, /href="\/learn\/ai-toolkit\/safe-guide\/"/);
    assert.match(first, /&lt;script&gt;/);
    assert.doesNotMatch(first, /处理 <script>/);
    assert.match(first, /href="\/learn\/ai-toolkit\/safe-guide\/second\/"/);
    assert.match(first, /data-lesson-check="safe-guide\/first"/);
    const workbook = await readFile(join(outputRoot, 'workbook.md'), 'utf8');
    assert.match(workbook, /完成一份纪要/);
    assert.match(workbook, /每个结论有来源/);
    const manifest = JSON.parse(await readFile(join(outputRoot, 'offline-manifest.json'), 'utf8'));
    assert.deepEqual(manifest, await buildManifest(outputRoot, '/learn/ai-toolkit/', 'fixture-source'));
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('toolkit rejects unsafe IDs and duplicate destinations before writing output', async () => {
  const build = await builder();
  const outputRoot = await mkdtemp(join(tmpdir(), 'toolkit-invalid-'));
  try {
    for (const guides of [
      [{ ...guide, id: '../escape' }],
      [guide, guide],
      [{ ...guide, lessons: [lesson('first'), lesson('first')] }],
      [{ ...guide, lessons: [lesson('../escape')] }],
      [{ ...guide, source: { title: 'unsafe', url: 'javascript:alert(1)' } }],
    ]) await assert.rejects(build({ guides, outputRoot, sourceCommit: 'fixture-source' }));
    assert.deepEqual(await readdir(outputRoot), []);
  } finally { await rm(outputRoot, { recursive: true, force: true }); }
});

test('all twelve approved guide areas are linked and locally readable in the published collection', async () => {
  const courses = JSON.parse(await readFile(new URL('../learn/courses.json', import.meta.url), 'utf8'));
  const entry = courses.find((course) => course.id === 'ai-toolkit');
  assert.ok(entry, 'AI learning shelf must expose the toolkit collection');
  const coverage = JSON.parse(await readFile(new URL('coverage.json', toolkitRoot), 'utf8'));
  assert.deepEqual(coverage.guides.map((guide) => guide.id).sort(), [
    'advanced-claude', 'antigravity-pm', 'claude-bonus', 'claude-everyone',
    'claude-pm', 'codex-pm', 'codex-skills', 'cowork', 'cursor-pm',
    'gsd', 'obsidian', 'ross-mike',
  ]);
  assert.equal(entry.chapterCount, coverage.totalLessons);
  const index = await readFile(new URL('index.html', toolkitRoot), 'utf8');
  for (const guide of coverage.guides) {
    assert.match(index, new RegExp(`href="/learn/ai-toolkit/${guide.id}/"`));
    for (const lesson of guide.lessons) await access(new URL(`${guide.id}/${lesson.id}/index.html`, toolkitRoot));
  }
  const manifest = JSON.parse(await readFile(new URL('offline-manifest.json', toolkitRoot), 'utf8'));
  assert.deepEqual(manifest, await buildManifest(toolkitRoot.pathname, '/learn/ai-toolkit/', coverage.sourceCommit));
});

test('toolkit progress ignores corrupt storage and unknown lesson IDs', async () => {
  const core = new URL('../learn/ai-toolkit/reader-core.mjs', import.meta.url);
  assert.ok(await access(core).then(() => true, () => false), 'reader progress core must exist');
  const { readProgress } = await import(core);
  const valid = ['claude-pm/files', 'codex-pm/plan'];
  for (const raw of ['{broken', 'null', '{}', '"anything"']) assert.deepEqual([...readProgress(raw, valid)], []);
  assert.deepEqual([...readProgress('["claude-pm/files","obsolete","claude-pm/files",42]', valid)], ['claude-pm/files']);
});
