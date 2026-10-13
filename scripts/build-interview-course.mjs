import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildManifest } from './generate-offline-manifest.mjs';
const root = resolve('learn/ai-engineering');
const prefix = '/learn/ai-engineering/';
const bank = JSON.parse(await readFile(resolve(root, 'bank.json'), 'utf8'));
const primarySources = (await import(pathToFileURL(resolve(root, 'primary-sources.mjs')))).default;
const notes = [...(await import(pathToFileURL(resolve(root, 'article-notes.mjs')))).default];
for (const file of (await readdir(root)).sort()) {
  if (!/^articles-.+\.mjs$/.test(file)) continue;
  notes.push(...(await import(pathToFileURL(resolve(root, file)))).default);
}
if (new Set(notes.map((note) => note.slug)).size !== notes.length) throw new Error('Duplicate article note');
const questionIds = new Set(bank.modules.flatMap((module) => module.questions.map((q) => q.id)));
for (const note of notes) {
  const directQuestions = bank.modules.flatMap((module) => module.questions.filter((q) => q.sources.some((s) => s.url.endsWith('/' + note.slug))).map((q) => q.id));
  note.questions = [...new Set([...directQuestions, ...(note.questions ?? [])])];
  if (![note.title, note.summary, note.extension].every((s) => typeof s === 'string' && s.trim())) throw new Error(`Incomplete article note: ${note.slug}`);
  if (!Array.isArray(note.questions) || !note.questions.length || note.questions.some((id) => !questionIds.has(id))) throw new Error(`Invalid article question links: ${note.slug}`);
}
const contents = new Map();
for (const file of await readdir(root)) {
  if (!file.endsWith('-content.mjs')) continue;
  const id = file.replace('-content.mjs', '');
  const entries = (await import(pathToFileURL(resolve(root, file)))).default;
  const module = bank.modules.find((m) => m.id === id);
  if (!module || entries.length > module.questions.length) throw new Error(`Invalid module ${id}`);
  entries.forEach((entry, index) => {
    if (entry.length !== 3 || entry.some((text) => !text?.trim())) throw new Error(`Invalid content ${id}:${index}`);
    contents.set(module.questions[index].id, { title: entry[0], explanation: entry[1], exercise: entry[2] });
  });
}
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const links = (sources) => sources.map((s) => `<a href="${escape(s.url)}" target="_blank" rel="noreferrer">${escape(s.title)} ↗</a>`).join(' · ');
const total = bank.modules.reduce((n, m) => n + m.questions.length, 0);
const progress = {
  sourceCommit: bank.sourceCommit,
  totalQuestions: total,
  translatedQuestions: contents.size,
  explainedQuestions: contents.size,
  totalArticleCandidates: bank.articles.length,
  articleNotes: notes.length,
  complete: contents.size === total && notes.length === bank.articles.length,
  modules: bank.modules.map((m) => ({ id: m.id, total: m.questions.length, completed: m.questions.filter((q) => contents.has(q.id)).length })),
  remainingArticles: bank.articles.filter((s) => !notes.some((n) => s.url.endsWith('/' + n.slug))),
};
await writeFile(resolve(root, 'progress.json'), JSON.stringify(progress, null, 2) + '\n');

function page(title, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f4f1ea"><title>${escape(title)} · Serebii Labs</title><link rel="icon" href="/learn/icon.svg"><link rel="stylesheet" href="${prefix}course.css"></head><body><main class="shell"><header class="topbar"><a class="brand" href="/"><i class="brand-mark"></i>Serebii Labs</a><nav aria-label="学习导航"><a href="/learn/">AI 学习</a><a href="${prefix}">面试专辑</a><a href="/notes/">图解笔记</a></nav><span class="eyebrow">AI Engineering / 02</span></header>${body}<footer><p>题目：Outcome School / Apache-2.0 · 中文译文与解析：Serebii Labs</p><p><a href="${prefix}SOURCE.md">授权与来源</a> · <a href="${prefix}upstream-README.md">固定版本题库</a></p></footer></main><script type="module" src="${prefix}reader.js"></script></body></html>\n`;
}
const offline = `<div class="offline-bar"><button class="button" id="save-offline" type="button">保存本专辑，离线阅读</button><span id="offline-status" role="status" aria-live="polite">首次保存需要联网；外部原文链接不包含在离线内容中。</span></div>`;
const overview = `<section class="course-hero"><div><span class="eyebrow">Read / Explain / Practice</span><h1>AI 工程<br><em>面试学习</em></h1><p class="lede">从概念走向工程判断。用中文理解原理、解释取舍，再用一个小任务检查是否真的掌握。</p></div><aside class="hero-note"><span class="eyebrow">Learning edition / 2026.10</span><strong>${total}</strong><p>道题 · 14 个模块</p><p>中文解析 ${contents.size} / ${total}<br>文章笔记 ${notes.length} / ${bank.articles.length}</p><a href="#modules">沿模块学习 ↓</a></aside></section>${offline}<section class="intro"><h2>怎么学 / How to use</h2><p>先不看解析，用自己的话回答；再检查原理与边界，完成自测任务。题库来自固定版本 <code>${bank.sourceCommit.slice(0, 7)}</code>。解析是本站编写的学习材料，不代表原作者逐题给出的标准答案。</p><p>${progress.complete ? '本版公开文章已收录中文提要，并附本站补充与校正。视频和社交内容保留原题链接，需要联网访问。' : '公开文章整理为短篇中文提要，并附本站补充与校正。未整理的文章、视频和社交内容保留原题链接，需要联网访问。'}</p><a class="button" href="${prefix}articles/">公开文章学习笔记 · ${notes.length} 篇 →</a></section><section id="modules"><div class="section-head"><h2>学习模块 / Modules</h2><p>${progress.complete ? '本版中文内容已全部收录' : '真实整理进度 · 持续补齐'}</p></div><div class="module-grid">${bank.modules.map((m, i) => {
  const count = m.questions.filter((q) => contents.has(q.id)).length;
  return `<a class="module-card tone-${i % 5}" href="${prefix}${m.id}/"><span class="eyebrow">${String(i + 1).padStart(2, '0')} / ${escape(m.originalTitle)}</span><h3>${escape(m.title)}</h3><p>${m.questions.length} 道题 · 中文解析 ${count}/${m.questions.length}</p><span>${count === m.questions.length ? '进入学习 →' : count ? '继续学习 →' : '查看原题 · 中文整理中 →'}</span></a>`;
}).join('')}</div></section>`;
const mustKnow = `<section class="intro"><h2>六个基础概念 / Must Know</h2><dl><dt><a href="${prefix}llm/">LLM · 大语言模型</a></dt><dd>学习语言分布，依据输入生成或处理文本；输出需要事实与任务验证。</dd><dt><a href="${prefix}rag/">RAG · 检索增强生成</a></dt><dd>先取外部证据，再据此生成回答；检索、来源和回答要分别评价。</dd><dt><a href="${prefix}agents/#agents-013">MCP · 模型上下文协议</a></dt><dd>用标准协议连接应用与工具、资源等能力；协议连接不替代权限控制。</dd><dt><a href="${prefix}agents/">Agent · 智能体</a></dt><dd>在目标与预算内循环判断、行动、观察，借助工具完成多步任务。</dd><dt><a href="${prefix}finetuning/">Fine-tuning · 微调</a></dt><dd>通过训练适配模型行为或任务能力，仍需检查泛化与旧任务退化。</dd><dt><a href="${prefix}llmops/">Quantization · 量化</a></dt><dd>用更低精度表示权重或激活，权衡内存、速度与质量，按硬件实测。</dd></dl></section>`;
await writeFile(resolve(root, 'index.html'), page('AI 工程面试学习', overview.replace('<section id="modules">', mustKnow + '<section id="modules">')));
for (const module of bank.modules) {
  await mkdir(resolve(root, module.id), { recursive: true });
  const count = module.questions.filter((q) => contents.has(q.id)).length;
  const body = `<section class="module-hero"><span class="eyebrow">${escape(module.originalTitle)}</span><h1>${escape(module.title)}</h1><p>${module.questions.length} 道题 · 中文解析 ${count}/${module.questions.length} · 已掌握 <span id="mastered-count">0</span>/${count}</p></section>${offline}<div class="study-tools"><label for="question-search">搜索本模块</label><input id="question-search" type="search" placeholder="输入概念、原文关键词或题号…"><span id="search-count" role="status">${module.questions.length} 道题</span><button class="button" id="expand-all" type="button">展开全部</button></div><p class="annotation">中文内容为本站解析。原题附带的答案链接用于延伸阅读，未整理为本地笔记的外链需联网。勾选掌握状态保存在当前浏览器。</p><section aria-label="题目与解析">${module.questions.map((q, i) => {
    const entry = contents.get(q.id);
    const localNotes = notes.filter((n) => n.questions.includes(q.id));
    return `<details class="question" id="${q.id}" data-question data-search="${escape([q.id, q.original, entry?.title, entry?.explanation].filter(Boolean).join(' ').toLowerCase())}"><summary><span class="question-number">${String(i + 1).padStart(2, '0')}</span><span>${escape(entry?.title ?? q.original)}</span><span class="question-state">${entry ? '中文解析' : '待整理'}</span></summary><div class="answer"><p class="original" lang="en">原题 / ${escape(q.original)}</p>${entry ? `<h3>原理与边界</h3><p>${escape(entry.explanation)}</p><div class="exercise"><h3>自测 / Try it</h3><p>${escape(entry.exercise)}</p></div><label class="mastery"><input type="checkbox" data-mastered="${q.id}"> 我能解释原理，并完成自测</label>` : '<p>本题中文解析正在整理。原题已保存在本专辑，可离线查看。</p>'}${localNotes.length ? `<p class="source-links">本地文章笔记：${localNotes.map((n) => `<a href="${prefix}articles/#${n.slug}">${escape(n.title)}</a>`).join(' · ')}</p>` : ''}${q.sources.length ? `<p class="source-links">原题答案外链：${links(q.sources)}</p>` : '<p class="source-links">原题未提供答案外链。</p>'}<a class="permalink" href="#${q.id}">本题固定链接 #${q.id}</a></div></details>`;
  }).join('')}</section><nav class="bottom-nav" aria-label="模块切换">${bank.modules.map((m) => `<a href="${prefix}${m.id}/" ${m.id === module.id ? 'aria-current="page"' : ''}>${escape(m.title)}</a>`).join('')}</nav>`;
  await writeFile(resolve(root, module.id, 'index.html'), page(module.title, body));
}
await mkdir(resolve(root, 'articles'), { recursive: true });
await writeFile(resolve(root, 'articles/index.html'), page('公开文章学习笔记', `<section class="module-hero"><span class="eyebrow">Public readings / Chinese study notes</span><h1>读原文，<br><em>拆原理。</em></h1><p>已整理 ${notes.length}/${bank.articles.length} 篇候选文章。这里是原创中文提要与学习校正，完整原文请访问来源。</p></section>${offline}<div class="study-tools"><label for="reading-search">搜索文章笔记</label><input id="reading-search" type="search" placeholder="输入主题、标题或关键术语…"><span id="reading-count" role="status">${notes.length} 篇笔记</span></div><section class="article-grid">${notes.map((note, i) => {
  const source = bank.articles.find((s) => s.url.endsWith('/' + note.slug));
  if (!source) throw new Error(`Unknown article ${note.slug}`);
  return `<article class="reading tone-${i % 5}" id="${note.slug}" data-reading data-search="${escape([note.title, source.title, note.summary, note.extension, ...note.questions].join(' ').toLowerCase())}"><span class="eyebrow">Reading ${String(i + 1).padStart(2, '0')} / 核读日期 2026-10-13</span><h2>${escape(note.title)}</h2><h3>原文提要</h3><p>${escape(note.summary)}</p><h3>理解与校正</h3><p>${escape(note.extension)}</p><p class="source-links">关联题目：${note.questions.map((id) => `<a href="${prefix}${id.split('-')[0]}/#${id}">${id}</a>`).join(' · ')}</p><p>${links([source])}</p>${primarySources[note.slug] ? `<p class="source-links">校核资料：${links(primarySources[note.slug])}</p>` : ''}</article>`;
}).join('')}</section><section class="intro"><h2>校核与进一步学习</h2><p>涉及具体模型、版本与实现时，优先核对原始论文和官方资料，避免将文章类比当成机制保证。</p><p>${links([
  { title: 'Attention Is All You Need', url: 'https://arxiv.org/abs/1706.03762' },
  { title: 'Chinchilla：计算最优训练', url: 'https://arxiv.org/abs/2203.15556' },
  { title: 'Recursive Language Models', url: 'https://arxiv.org/abs/2512.24601' },
  { title: 'Large Language Diffusion Models', url: 'https://arxiv.org/abs/2502.09992' },
  { title: 'DeepSeek-V4 Transformers 实现说明', url: 'https://github.com/huggingface/transformers/blob/main/docs/source/en/model_doc/deepseek_v4.md' },
  { title: 'TypeSafe AI', url: 'https://typesafe.ai/' },
  { title: 'GQA：从多头检查点后训练转换', url: 'https://arxiv.org/abs/2305.13245' },
  { title: 'FlashAttention 原论文', url: 'https://arxiv.org/abs/2205.14135' },
  { title: 'Self-RAG 原论文', url: 'https://arxiv.org/abs/2310.11511' },
  { title: 'ColBERT 原论文', url: 'https://arxiv.org/abs/2004.12832' },
  { title: 'Contextual Retrieval 原始介绍', url: 'https://www.anthropic.com/engineering/contextual-retrieval' },
])}</p></section>`));
await writeFile(resolve(root, 'SOURCE.md'), `# AI 工程面试学习：来源与授权\n\n题库来源：${bank.sourceRepository}\n\n固定提交：${bank.sourceCommit}\n\n核查日期：2026-10-13\n\n题目原文与题目中文译文适用 Apache-2.0。Copyright (C) 2026 Outcome School。许可证保存在 LICENSE.txt；固定版本 README 保存在 upstream-README.md。中文译文标明为本站修改。\n\n本站编写的中文解析与自测任务属于补充学习材料，不是原作者逐题标准答案。公开文章不因在题库中被链接而自动适用题库许可证；本站仅保存有来源链接的简短原创提要与校正，不复制全文、图片或收费课程。视频及社交内容仅保留外链。\n\n当前范围：${total} 道原题；${contents.size} 道中文译文与解析；${notes.length} 篇中文文章笔记。完整剩余清单见 progress.json。尚未整理的内容不计入完成数量。\n\n离线功能：缓存本专辑所有本地页面、样式、脚本与来源记录；原文外链仍需联网。缓存依赖浏览器存储，若被清理需重新保存。\n`);
await writeFile(resolve(root, 'offline-manifest.json'), JSON.stringify(await buildManifest(root, prefix, bank.sourceCommit), null, 2) + '\n');
console.log(JSON.stringify({ questions: total, explained: contents.size, articleNotes: notes.length, complete: progress.complete }));
