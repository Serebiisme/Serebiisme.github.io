import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importSources, verifyInventory, buildCatalog } from './source.mjs';

const root = resolve('content/ai-from-scratch');
const sourceLock = JSON.parse(await readFile(resolve(root, 'source-lock.json'), 'utf8'));
console.log('Downloading two pinned snapshots as data; upstream code will not run.');
const inventory = await importSources({ sourceLock, destination: root });
await verifyInventory({ root, inventory });
const catalog = await buildCatalog({ sourceRoot: resolve(root, 'upstream/en'), translationRoot: resolve(root, 'upstream/zh'), expectedCounts: sourceLock.expectedCounts });
const policy = {
  scope: 'Main phases and projects only; no certifications, manuals, installer skills, external datasets or model weights.',
  sourceLicense: 'MIT; Copyright (c) 2026 Rohit Ghumare',
  state: 'Imported source data only. Third-party resources require individual review before publishing.',
  includedPrefixes: ['phases/', 'projects/', 'learning-paths/'],
  notes: 'Internal project grader and lesson runner source is retained for download, not executed. Unreviewed source figures are data, not active scripts.',
};
for (const [name, value] of [['inventory.json', inventory], ['catalog.json', catalog]]) await writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n');
await writeFile(resolve(root, 'resource-policy.json'), JSON.stringify(policy, null, 2) + '\n', { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
console.log(JSON.stringify({ ...Object.fromEntries(Object.entries(catalog).map(([key, value]) => [key, value.length])), files: inventory.files.length, bytes: inventory.files.reduce((n, file) => n + file.bytes, 0), sourceCommit: inventory.sourceCommit, translationCommit: inventory.translationCommit }));
