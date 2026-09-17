import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function validatePrefix(publicPrefix) {
  if (!publicPrefix.startsWith('/') || !publicPrefix.endsWith('/')) {
    throw new TypeError('publicPrefix must begin and end with a slash');
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

export async function collectAssets(rootDir, publicPrefix) {
  validatePrefix(publicPrefix);
  const root = resolve(rootDir);
  const files = await walk(root);
  return files
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((path) => path !== 'offline-manifest.json')
    .map((path) => `${publicPrefix}${path}`)
    .sort((a, b) => a.localeCompare(b));
}

export async function buildManifest(rootDir, publicPrefix, sourceCommit) {
  const root = resolve(rootDir);
  const assets = await collectAssets(root, publicPrefix);
  const digest = createHash('sha256');
  digest.update(`${sourceCommit}\0`);
  for (const url of assets) {
    const path = url.slice(publicPrefix.length);
    digest.update(`${url}\0`);
    digest.update(await readFile(resolve(root, path)));
    digest.update('\0');
  }
  return {
    version: digest.digest('hex').slice(0, 16),
    sourceCommit,
    assets,
  };
}

async function main() {
  const [rootDir, publicPrefix, sourceCommit, output] = process.argv.slice(2);
  if (!rootDir || !publicPrefix || !sourceCommit || !output) {
    throw new Error(
      'Usage: node generate-offline-manifest.mjs ROOT PUBLIC_PREFIX SOURCE_COMMIT OUTPUT',
    );
  }
  const manifest = await buildManifest(rootDir, publicPrefix, sourceCommit);
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
}

const isCli = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isCli) await main();
