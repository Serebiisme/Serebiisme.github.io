import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function editionDirectories(editions) {
  return new Set(
    Object.values(editions).map(({ directory }) => {
      if (
        typeof directory !== 'string' ||
        !/^[A-Za-z0-9._-]+$/.test(directory) ||
        directory === '.' ||
        directory === '..'
      ) {
        throw new Error(`Unsafe edition directory: ${String(directory)}`);
      }
      return directory;
    }),
  );
}

async function readEditions(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function pruneEditions(
  sourceRootArg,
  originalEditionsPath,
  selectedEditionsPath,
) {
  const sourceRoot = resolve(sourceRootArg);
  const original = editionDirectories(await readEditions(originalEditionsPath));
  const selected = editionDirectories(await readEditions(selectedEditionsPath));

  for (const directory of original) {
    if (selected.has(directory)) continue;
    const target = resolve(sourceRoot, directory);
    if (dirname(target) !== sourceRoot) {
      throw new Error(`Refusing to remove path outside source root: ${target}`);
    }
    await rm(target, { recursive: true, force: true });
  }
}

const [sourceRoot, originalEditions, selectedEditions] = process.argv.slice(2);
if (!sourceRoot || !originalEditions || !selectedEditions) {
  throw new Error(
    'Usage: node prune-ai-agent-book.mjs SOURCE_ROOT ORIGINAL_EDITIONS SELECTED_EDITIONS',
  );
}

await pruneEditions(sourceRoot, originalEditions, selectedEditions);
