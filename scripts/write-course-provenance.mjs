import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function provenanceMarkdown(sourceCommit, sourceDate) {
  return `# Source and modifications

- Original work: [AI Agents in Depth](https://github.com/bojieli/ai-agent-book)
- Author and copyright: Bojie Li, Copyright 2025
- License: Apache License 2.0
- Source commit: \`${sourceCommit}\`
- Source commit date: ${sourceDate}

## Serebii Labs modifications

- Chinese-only edition configuration: the generated mirror includes the original Simplified Chinese edition only.
- Added supplemental routes for the unmodified introduction, afterword, and reference answers Markdown sources.
- Rebased static asset URLs under \`/learn/ai-agent-book/\` and generated an offline resource manifest.
- Restyled the course cover with Serebii Labs editorial typography, pastel chapter cards, and flat geometric illustrations; original chapter content and reader controls are preserved.

Serebii Labs provides this attributed offline mirror and is not affiliated with, endorsed by, or operated by the original author.
`;
}

export async function writeProvenance(path, sourceCommit, sourceDate) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, provenanceMarkdown(sourceCommit, sourceDate));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [targetArg, sourceCommit, sourceDate] = process.argv.slice(2);
  if (!targetArg || !sourceCommit || !sourceDate) {
    throw new Error(
      'Usage: node write-course-provenance.mjs TARGET SOURCE_COMMIT SOURCE_DATE',
    );
  }
  await writeProvenance(resolve(targetArg), sourceCommit, sourceDate);
}
