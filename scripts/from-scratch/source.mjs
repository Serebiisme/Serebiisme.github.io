import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';

const MAX_EXPANDED = 512 * 1024 * 1024;
const MAX_COMPRESSED = 64 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const hash = (data) => createHash('sha256').update(data).digest('hex');
const slug = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export function safeRelative(path) {
  if (typeof path !== 'string' || !path || path.length > 2048 || /[\\\x00-\x1f\x7f%]/.test(path) || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').some((p) => !p || p === '.' || p === '..')) {
    throw new Error(`Unsafe source path: ${JSON.stringify(path)}`);
  }
  return path;
}

async function contained(root, path) {
  const safe = safeRelative(path);
  const parts = safe.split('/');
  let current = resolve(root);
  for (const part of ['', ...parts]) {
    if (part) current = resolve(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Source symlink is forbidden: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return resolve(root, safe);
}

async function filesUnder(root) {
  const paths = [];
  async function visit(path) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Source symlink is forbidden: ${path}`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(resolve(path, name));
    } else if (stat.isFile()) {
      paths.push(safeRelative(relative(root, path).split(sep).join('/')));
    } else throw new Error(`Unsupported source type: ${path}`);
  }
  await visit(resolve(root));
  return paths;
}

const field = (header, start, length) => utf8.decode(header.subarray(start, start + length)).split('\0')[0];
function octal(value) {
  const text = value.trim();
  if (!/^[0-7]+$/.test(text)) throw new Error('Invalid archive numeric field');
  return parseInt(text, 8);
}
function paxRecords(data) {
  const result = {};
  for (let offset = 0; offset < data.length;) {
    const space = data.indexOf(32, offset);
    if (space < 0) throw new Error('Invalid PAX record');
    const countText = data.subarray(offset, space).toString('ascii');
    if (!/^[0-9]+$/.test(countText)) throw new Error('Invalid PAX length');
    const count = Number(countText);
    if (count <= space - offset + 1 || offset + count > data.length || data[offset + count - 1] !== 10) throw new Error('Invalid PAX size');
    const text = utf8.decode(data.subarray(space + 1, offset + count - 1));
    const index = text.indexOf('=');
    if (index < 1) throw new Error('Invalid PAX key');
    result[text.slice(0, index)] = text.slice(index + 1);
    offset += count;
  }
  return result;
}

// GitHub tar snapshots are parsed as data. No tar command, hook, installer or
// source program is invoked, and all entries are checked before any write.
function unpack(compressed, repository, revision) {
  if (compressed.length > MAX_COMPRESSED) throw new Error('Compressed archive exceeds size limit');
  const tar = gunzipSync(compressed, { maxOutputLength: MAX_EXPANDED });
  const prefix = `${repository.split('/')[1]}-${revision}`;
  const entries = new Map();
  let metadata = {};
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (!tar.subarray(offset).every((b) => b === 0)) throw new Error('Unexpected data after archive footer');
      return entries;
    }
    const expected = octal(field(header, 148, 8));
    const actual = header.reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0);
    if (actual !== expected) throw new Error('Archive header checksum mismatch');
    const size = octal(field(header, 124, 12));
    const type = String.fromCharCode(header[156]);
    const end = offset + 512 + size;
    if (end > tar.length) throw new Error('Truncated archive entry');
    const data = tar.subarray(offset + 512, end);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x' || type === 'g') {
      const pax = paxRecords(data);
      if (pax.linkpath) throw new Error('Archive links are forbidden');
      if (pax.comment && pax.comment !== revision) throw new Error('Archive revision mismatch');
      if (pax.path) safeRelative(pax.path.replace(/\/$/, ''));
      if (type === 'x') metadata = pax;
      continue;
    }
    if (!['0', '\0', '5'].includes(type)) throw new Error(`Archive link or unsupported type: ${type}`);
    const pre = field(header, 345, 155);
    const rawName = metadata.path ?? `${pre ? `${pre}/` : ''}${field(header, 0, 100)}`;
    metadata = {};
    const name = rawName.replace(/\/$/, '');
    safeRelative(name);
    if (name === prefix && type === '5') continue;
    if (!name.startsWith(`${prefix}/`)) throw new Error(`Archive path outside pinned revision: ${name}`);
    const path = safeRelative(name.slice(prefix.length + 1));
    if (type === '5') continue;
    if (entries.has(path)) throw new Error(`Duplicate archive path: ${path}`);
    entries.set(path, Buffer.from(data));
  }
  throw new Error('Archive footer is missing');
}

function selectedEnglish(path) {
  return path.startsWith('phases/') || path.startsWith('projects/') || path.startsWith('learning-paths/')
    || ['LICENSE', 'README.md', 'ROADMAP.md', 'requirements.txt', 'glossary/terms.md', 'scripts/project_test.py', 'scripts/_lib.py', 'scripts/lesson_run.py', 'scripts/run_lesson_tests.py'].includes(path)
    || /^site\/(?:figures[^/]*\.js|lesson-figures\.js|assets\/figures\/[^/]+)$/.test(path);
}

export async function importSources({ sourceLock, destination, fetchImpl = fetch }) {
  const { repository, sourceCommit, translationCommit } = sourceLock ?? {};
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || ![sourceCommit, translationCommit].every((s) => /^[a-f0-9]{40}$/.test(s ?? ''))) throw new Error('Invalid pinned source lock');
  const selected = [];
  for (const [language, revision] of [['en', sourceCommit], ['zh', translationCommit]]) {
    const response = await fetchImpl(`https://codeload.github.com/${repository}/tar.gz/${revision}`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Snapshot download failed: ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_COMPRESSED) throw new Error('Compressed archive exceeds size limit');
    const entries = unpack(Buffer.from(await response.arrayBuffer()), repository, revision);
    for (const [sourcePath, data] of entries) {
      let path;
      if (language === 'en' && selectedEnglish(sourcePath)) path = `upstream/en/${sourcePath}`;
      if (language === 'zh' && /^i18n\/zh\/phases\/[^/]+\/[^/]+\/docs\/zh\.md$/.test(sourcePath)) path = `upstream/zh/${sourcePath.slice('i18n/zh/'.length)}`;
      if (path) selected.push({ path, sourcePath, revision, bytes: data.length, sha256: hash(data), data });
    }
  }
  if (!selected.some((x) => x.path === 'upstream/en/LICENSE') || !selected.some((x) => x.path.startsWith('upstream/zh/'))) throw new Error('Snapshot is missing required license or Chinese source');
  for (const entry of selected) {
    const target = await contained(destination, entry.path);
    try {
      const existing = await readFile(target);
      if (hash(existing) !== entry.sha256) throw new Error(`Immutable source differs: ${entry.path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const entry of selected) {
    const target = await contained(destination, entry.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.data, { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  }
  return { schemaVersion: 1, repository, sourceCommit, translationCommit, files: selected.map(({ data, ...entry }) => entry).sort((a, b) => a.path.localeCompare(b.path)) };
}

export async function verifyInventory({ root, inventory }) {
  if (!Array.isArray(inventory?.files) || !inventory.files.length) throw new Error('Invalid source inventory');
  const paths = inventory.files.map((entry) => safeRelative(entry.path));
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate inventory path');
  for (const entry of inventory.files) {
    const data = await readFile(await contained(root, entry.path));
    if (data.length !== entry.bytes) throw new Error(`Source size mismatch: ${entry.path}`);
    if (hash(data) !== entry.sha256) throw new Error(`Source hash mismatch: ${entry.path}`);
  }
  const actual = (await filesUnder(resolve(root, 'upstream'))).map((p) => `upstream/${p}`);
  if (actual.length !== paths.length || actual.some((p) => !paths.includes(p))) throw new Error('Untracked source file in immutable inventory');
}

const heading = (text, path) => {
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error(`Missing lesson title: ${path}`);
  return title;
};
const decodeFile = async (root, path) => utf8.decode(await readFile(await contained(root, path)));

export async function buildCatalog({ sourceRoot, translationRoot, expectedCounts }) {
  const paths = await filesUnder(sourceRoot);
  const zhPaths = new Set(await filesUnder(translationRoot));
  const lessonIds = new Set(paths.flatMap((path) => {
    const match = path.match(/^phases\/([^/]+)\/([^/]+)\//);
    return match ? [`${match[1]}/${match[2]}`] : [];
  }));
  const lessons = [];
  const quizzes = [];
  for (const id of [...lessonIds].sort()) {
    const [phaseId, lessonSlug] = id.split('/');
    if (!slug(phaseId) || !slug(lessonSlug) || !/^\d{2}-/.test(phaseId) || !/^\d{2}-/.test(lessonSlug)) throw new Error(`Invalid lesson id: ${id}`);
    const prefix = `phases/${id}/`;
    const englishPath = `${prefix}docs/en.md`;
    if (!paths.includes(englishPath)) throw new Error(`Missing lesson docs/en.md: ${id}`);
    const english = await readFile(await contained(sourceRoot, englishPath));
    const draftPath = `${prefix}docs/zh.md`;
    if (!zhPaths.has(draftPath)) throw new Error(`Missing Chinese draft: ${id}`);
    const quizPath = paths.includes(`${prefix}quiz.json`) ? `${prefix}quiz.json` : null;
    if (quizPath) {
      const quiz = JSON.parse(await decodeFile(sourceRoot, quizPath));
      const questions = Array.isArray(quiz) ? quiz : quiz.questions;
      if (!Array.isArray(questions) || !questions.length || questions.some((q) => typeof q.question !== 'string' || !Array.isArray(q.options) || q.options.length < 2 || q.options.some((o) => typeof o !== 'string') || !Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length || typeof q.explanation !== 'string')) throw new Error(`Invalid quiz: ${quizPath}`);
      quizzes.push({ lessonId: id, path: quizPath, questions: questions.length, format: Array.isArray(quiz) ? 'array' : 'object' });
    }
    lessons.push({ id, phaseId, slug: lessonSlug, titleEn: heading(utf8.decode(english), englishPath), titleZh: heading(await decodeFile(translationRoot, draftPath), draftPath), englishPath, draftPath, sourceHash: hash(english), codePaths: paths.filter((p) => p.startsWith(`${prefix}code/`)), outputPaths: paths.filter((p) => p.startsWith(`${prefix}outputs/`)), quizPath });
  }
  const projects = [];
  const templates = [];
  for (const path of paths.filter((p) => /^projects\/[^/]+\/project\.json$/.test(p))) {
    const id = path.split('/')[1];
    const meta = JSON.parse(await decodeFile(sourceRoot, path));
    if (id === '_template') { templates.push(path); continue; }
    if (!slug(id) || meta.id !== id || !Array.isArray(meta.stages) || !meta.stages.length) throw new Error(`Invalid project id or stages: ${path}`);
    const projectPaths = paths.filter((p) => p.startsWith(`projects/${id}/`));
    const readmePath = `projects/${id}/README.md`;
    if (!paths.includes(readmePath)) throw new Error(`Missing project README: ${id}`);
    const stageDocPaths = meta.stages.map((s) => {
      if (!slug(s.id)) throw new Error(`Invalid project stage id: ${id}`);
      const doc = `projects/${id}/stages/${s.id}/docs/en.md`;
      if (!paths.includes(doc)) throw new Error(`Missing project stage: ${doc}`);
      return doc;
    });
    if (new Set(stageDocPaths).size !== stageDocPaths.length) throw new Error(`Duplicate project stage: ${id}`);
    projects.push({ id, titleEn: meta.title, titleZh: null, summaryEn: meta.summary ?? meta.tagline ?? '', metadataPath: path, readmePath, stageDocPaths, starterPaths: projectPaths.filter((p) => p.startsWith(`projects/${id}/starter/`)), solutionPaths: projectPaths.filter((p) => p.startsWith(`projects/${id}/solution/`)), graderPaths: projectPaths.filter((p) => /\/(?:tests|grader)\//.test(p)), metadata: meta });
  }
  const phases = [...new Set(lessons.map((l) => l.phaseId))].sort().map((id) => ({ id, lessons: lessons.filter((l) => l.phaseId === id).map((l) => l.id) }));
  const catalog = { phases, lessons, projects, quizzes, templates };
  for (const key of ['phases', 'lessons', 'quizzes', 'projects']) {
    if (!Number.isInteger(expectedCounts?.[key]) || catalog[key].length !== expectedCounts[key]) throw new Error(`Pinned ${key} count mismatch: expected ${expectedCounts?.[key]}, found ${catalog[key].length}`);
  }
  return catalog;
}
