import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateEditorial } from '../scripts/from-scratch/editorial.mjs';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const english = '# Original\nKeep the code.\n';
const chinese = '# 校订版\n保留代码。\n';
const id = '00-foundation/01-intro';
const catalog = { lessons: [{ id, englishPath: `phases/${id}/docs/en.md`, sourceHash: digest(english) }] };
const readText = async (path) => path.startsWith('upstream/en/') ? english : chinese;
const reviewed = {
  lessonId: id, status: 'reviewed', englishSha256: digest(english), chineseSha256: digest(chinese), reviewedAt: '2026-10-14',
  checks: { meaning: true, terminology: true, math: true, codeReferences: true, exercises: true, limitations: true },
  notes: ['逐段核对英文；确认没有把范围限定译为保证。'], runConditions: ['stdlib'], executionEvidence: null,
};

test('existing Chinese drafts never grant reviewed status without an editorial record', async () => {
  const report = await validateEditorial({ catalog, records: [], readText });
  assert.equal(report.total, 1);
  assert.equal(report.reviewed, 0);
  assert.equal(report.draft, 1);
});
test('counts a reviewed lesson only when both source and edited text hashes match', async () => {
  const report = await validateEditorial({ catalog, records: [reviewed], readText });
  assert.equal(report.reviewed, 1);
  assert.equal(report.draft, 0);
  assert.deepEqual(report.staleIds, []);
  assert.deepEqual(report.blockers, []);
});
test('a source update invalidates an old review instead of silently reporting completion', async () => {
  const report = await validateEditorial({ catalog, records: [reviewed], readText: async (path) => path.startsWith('upstream/en/') ? english + 'Changed' : chinese });
  assert.deepEqual(report.staleIds, [id]);
  assert.equal(report.reviewed, 0);
});
test('editing the Chinese text after review also invalidates the review', async () => {
  const report = await validateEditorial({ catalog, records: [reviewed], readText: async (path) => path.startsWith('upstream/en/') ? english : chinese + 'Changed' });
  assert.deepEqual(report.staleIds, [id]);
  assert.equal(report.reviewed, 0);
});
test('incomplete checks cannot claim a lesson was fully reviewed', async () => {
  await assert.rejects(validateEditorial({ catalog, records: [{ ...reviewed, checks: { ...reviewed.checks, math: false } }], readText }), /checks/i);
});
test('unknown and duplicate lesson records are rejected rather than inflating progress', async () => {
  await assert.rejects(validateEditorial({ catalog, records: [{ ...reviewed, lessonId: 'unknown' }], readText }), /unknown/i);
  await assert.rejects(validateEditorial({ catalog, records: [reviewed, reviewed], readText }), /duplicate/i);
});
test('reviewed records require real date, nonempty review notes, and known runtime conditions', async () => {
  for (const change of [{ reviewedAt: '2026-13-99' }, { notes: [] }, { runConditions: ['everything-offline'] }]) {
    await assert.rejects(validateEditorial({ catalog, records: [{ ...reviewed, ...change }], readText }), /date|notes|conditions/i);
  }
});
