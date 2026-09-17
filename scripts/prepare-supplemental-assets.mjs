import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';

const supplementalDocuments = [
  'introduction.md',
  'afterword.md',
  'reference-answers.md',
];

function assertInside(root, path) {
  const child = relative(root, path);
  if (!child || child === '..' || child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Path escapes root: ${path}`);
  }
}

export async function prepareSupplementalAssets(sourceRootArg, publicRootArg) {
  const sourceRoot = resolve(sourceRootArg);
  const publicRoot = resolve(publicRootArg);
  const directory = 'book';
  const images = new Set();

  for (const document of supplementalDocuments) {
    const markdown = await readFile(resolve(sourceRoot, directory, document), 'utf8');
    for (const match of markdown.matchAll(/!\[[^\]]*\]\((images\/[^)\s]+)\)/g)) {
      images.add(match[1]);
    }
  }

  for (const image of images) {
    if (extname(image).toLowerCase() !== '.svg') {
      throw new Error(`Unsupported supplemental figure: ${image}`);
    }
    const original = resolve(sourceRoot, directory, image);
    assertInside(resolve(sourceRoot, directory), original);
    const publicOriginal = resolve(publicRoot, directory, image);
    assertInside(publicRoot, publicOriginal);
    await mkdir(dirname(publicOriginal), { recursive: true });
    await copyFile(original, publicOriginal);

    const name = image.replace(/^images\//, '').replace(/\.[^.]+$/, '');
    const vector = await readFile(original, 'utf8');
    for (const theme of ['light', 'dark']) {
      const themed = resolve(
        publicRoot,
        'figures',
        'book',
        directory,
        `${name}-${theme}.svg`,
      );
      assertInside(publicRoot, themed);
      await mkdir(dirname(themed), { recursive: true });
      await writeFile(themed, vector);
    }
  }

  return images.size;
}

const [sourceRoot, publicRoot] = process.argv.slice(2);
if (!sourceRoot || !publicRoot) {
  throw new Error(
    'Usage: node prepare-supplemental-assets.mjs SOURCE_ROOT PUBLIC_ROOT',
  );
}

const count = await prepareSupplementalAssets(sourceRoot, publicRoot);
console.log(`Prepared ${count} supplemental figures from the original sources.`);
