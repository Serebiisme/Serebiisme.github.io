import {
  access,
  copyFile,
  cp,
  mkdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildManifest } from './generate-offline-manifest.mjs';

const requiredPages = [
  'index.html',
  ...Array.from({ length: 10 }, (_, index) =>
    `book/chapter${index + 1}/index.html`),
  'introduction/index.html',
  'afterword/index.html',
  'reference-answers/index.html',
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function validateBuild(dist) {
  for (const page of requiredPages) {
    if (!(await exists(resolve(dist, page)))) {
      throw new Error(`Missing required page: ${page}`);
    }
  }
}

async function writeProvenance(staging, sourceCommit, sourceDate) {
  const source = `# Source and modifications

- Original work: [AI Agents in Depth](https://github.com/bojieli/ai-agent-book)
- Author and copyright: Bojie Li, Copyright 2025
- License: Apache License 2.0
- Source commit: \`${sourceCommit}\`
- Source commit date: ${sourceDate}

## Serebii Labs modifications

- Chinese-only edition configuration: the generated mirror includes the original Simplified Chinese edition only.
- Added supplemental routes for the unmodified introduction, afterword, and reference answers Markdown sources.
- Rebased static asset URLs under \`/learn/ai-agent-book/\` and generated an offline resource manifest.

Serebii Labs provides this attributed offline mirror and is not affiliated with, endorsed by, or operated by the original author.
`;
  await writeFile(resolve(staging, 'SOURCE.md'), source);
}

async function importCourse(dist, target, license, sourceCommit, sourceDate) {
  await validateBuild(dist);
  const staging = `${target}.staging-${process.pid}`;
  const backup = `${target}.backup-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await cp(dist, staging, { recursive: true });
  await copyFile(license, resolve(staging, 'LICENSE.txt'));
  await writeProvenance(staging, sourceCommit, sourceDate);
  const manifest = await buildManifest(
    staging,
    '/learn/ai-agent-book/',
    sourceCommit,
  );
  await writeFile(
    resolve(staging, 'offline-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const hadTarget = await exists(target);
  try {
    if (hadTarget) await rename(target, backup);
    await rename(staging, target);
    if (hadTarget) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (!(await exists(target)) && (await exists(backup))) {
      await rename(backup, target);
    }
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

const [distArg, targetArg, licenseArg, sourceCommit, sourceDate] =
  process.argv.slice(2);
if (!distArg || !targetArg || !licenseArg || !sourceCommit || !sourceDate) {
  throw new Error(
    'Usage: node import-ai-agent-book.mjs DIST TARGET LICENSE SOURCE_COMMIT SOURCE_DATE',
  );
}

await importCourse(
  resolve(distArg),
  resolve(targetArg),
  resolve(licenseArg),
  sourceCommit,
  sourceDate,
);
