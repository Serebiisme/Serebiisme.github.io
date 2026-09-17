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
  publicRootArg,
  originalEditionsPath,
  selectedEditionsPath,
) {
  const sourceRoot = resolve(sourceRootArg);
  const publicRoot = resolve(publicRootArg);
  const themedRoot = resolve(publicRoot, 'figures', 'book');
  const original = editionDirectories(await readEditions(originalEditionsPath));
  const selected = editionDirectories(await readEditions(selectedEditionsPath));

  for (const directory of original) {
    if (selected.has(directory)) continue;
    const targets = [
      { parent: sourceRoot, target: resolve(sourceRoot, directory) },
      { parent: publicRoot, target: resolve(publicRoot, directory) },
      { parent: themedRoot, target: resolve(themedRoot, directory) },
    ];
    if (directory === 'book-en') {
      const figuresRoot = resolve(publicRoot, 'figures');
      targets.push({
        parent: figuresRoot,
        target: resolve(figuresRoot, 'chapter2-en'),
      });
    }
    for (const { parent, target } of targets) {
      if (dirname(target) !== parent) {
        throw new Error(`Refusing to remove path outside expected root: ${target}`);
      }
      await rm(target, { recursive: true, force: true });
    }
  }
}

const [sourceRoot, publicRoot, originalEditions, selectedEditions] =
  process.argv.slice(2);
if (!sourceRoot || !publicRoot || !originalEditions || !selectedEditions) {
  throw new Error(
    'Usage: node prune-ai-agent-book.mjs SOURCE_ROOT PUBLIC_ROOT ORIGINAL_EDITIONS SELECTED_EDITIONS',
  );
}

await pruneEditions(
  sourceRoot,
  publicRoot,
  originalEditions,
  selectedEditions,
);
