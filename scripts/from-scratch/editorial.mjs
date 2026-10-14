import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRelative } from './source.mjs';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const checks = ['meaning', 'terminology', 'math', 'codeReferences', 'exercises', 'limitations'];
const conditions = new Set(['stdlib', 'dependencies', 'model-data', 'network']);

export async function validateEditorial({ catalog, records, readText }) {
  if (!Array.isArray(catalog?.lessons) || !Array.isArray(records)) throw new Error('Invalid editorial catalog or records');
  const lessons = new Map(catalog.lessons.map((lesson) => [lesson.id, lesson]));
  if (lessons.size !== catalog.lessons.length) throw new Error('Duplicate catalog lesson');
  const seen = new Set();
  const report = { total: lessons.size, reviewed: 0, draft: lessons.size, staleIds: [], blockers: [] };
  for (const record of records) {
    const lesson = lessons.get(record.lessonId);
    if (!lesson) throw new Error(`Unknown editorial lesson: ${record.lessonId}`);
    if (seen.has(record.lessonId)) throw new Error(`Duplicate editorial record: ${record.lessonId}`);
    seen.add(record.lessonId);
    if (!['draft', 'reviewed'].includes(record.status)) throw new Error(`Invalid review status: ${record.lessonId}`);
    if (record.status === 'draft') continue;
    if (checks.some((key) => record.checks?.[key] !== true)) throw new Error(`Incomplete editorial checks: ${record.lessonId}`);
    if (typeof record.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewedAt) || Number.isNaN(Date.parse(record.reviewedAt)) || new Date(record.reviewedAt).toISOString().slice(0, 10) !== record.reviewedAt) throw new Error(`Invalid review date: ${record.lessonId}`);
    if (!Array.isArray(record.notes) || !record.notes.length || record.notes.some((note) => typeof note !== 'string' || !note.trim())) throw new Error(`Missing review notes: ${record.lessonId}`);
    if (!Array.isArray(record.runConditions) || !record.runConditions.length || record.runConditions.some((condition) => !conditions.has(condition))) throw new Error(`Invalid runtime conditions: ${record.lessonId}`);
    if (![record.englishSha256, record.chineseSha256].every((hash) => /^[a-f0-9]{64}$/.test(hash ?? ''))) throw new Error(`Invalid review hash: ${record.lessonId}`);
    const english = await readText(`upstream/en/${safeRelative(lesson.englishPath)}`);
    let chinese;
    try {
      chinese = await readText(`editions/${safeRelative(lesson.id)}.md`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      report.blockers.push({ lessonId: lesson.id, reason: 'reviewed-text-missing' });
      continue;
    }
    if (digest(english) !== record.englishSha256 || digest(chinese) !== record.chineseSha256 || lesson.sourceHash !== record.englishSha256) {
      report.staleIds.push(lesson.id);
      report.blockers.push({ lessonId: lesson.id, reason: 'review-hash-stale' });
      continue;
    }
    report.reviewed++;
  }
  report.draft = report.total - report.reviewed;
  return report;
}

async function main() {
  const root = resolve('content/ai-from-scratch');
  const catalog = JSON.parse(await readFile(resolve(root, 'catalog.json'), 'utf8'));
  const { records } = JSON.parse(await readFile(resolve(root, 'editorial.json'), 'utf8'));
  const report = await validateEditorial({ catalog, records, readText: (path) => readFile(resolve(root, safeRelative(path))) });
  console.log(JSON.stringify(report));
  if (report.blockers.length || (process.argv.includes('--require-reviewed') && report.reviewed !== report.total)) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
