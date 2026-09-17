import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after the upstream build, before hashing the offline assets.
export async function applyCourseTheme(directory) {
  const page = resolve(directory, 'index.html');
  let html = await readFile(page, 'utf8');
  if (!html.includes('class="home-hero')) return;
  await copyFile(new URL('../overlays/ai-agent-book/labs-theme.css', import.meta.url), resolve(directory, 'labs-theme.css'));
  if (!html.includes('data-labs-theme')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/learn/ai-agent-book/labs-theme.css" data-labs-theme></head>');
    html = html.replace('<body>', '<body class="labs-course">');
    html = html.replace(/<a class="brand"[^>]*>[\s\S]*?<\/a>/, '<a class="brand" href="/" aria-label="Serebii Labs 返回首页"><span class="brand-mark" aria-hidden="true"></span><span>Serebii Labs</span></a>');
    html = html.replace('<span class="current-language">简体中文</span>', '<span class="current-language">AI LEARNING / 01</span>');
    html = html.replace('<span class="status-dot"></span>一本开源书', '<span class="status-dot"></span>AI 学习 / COURSE 001');
    html = html.replace('全书目录<span class="accent-period">.</span>', '章节目录 / Contents<span class="accent-period">.</span>');
  }
  await writeFile(page, html);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node apply-course-theme.mjs COURSE_DIRECTORY');
  await applyCourseTheme(resolve(process.argv[2]));
}
