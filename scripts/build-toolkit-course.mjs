import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildManifest } from './generate-offline-manifest.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '/learn/ai-toolkit/';
export const referenceCommit = '45328639a4a62626f00242b3395512c91b56865e';
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const list = (items, ordered = false) => `<${ordered ? 'ol' : 'ul'}>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const external = (source) => `<a href="${escape(source.url)}" target="_blank" rel="noreferrer">${escape(source.title)} ↗</a>`;
const route = (guide, lesson) => `${prefix}${guide.id}/${lesson ? `${lesson.id}/` : ''}`;
function validateGuides(guides) {
  const destinations = new Set();
  function id(value) { if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`Unsafe ID: ${value}`); }
  function text(value) { if (typeof value !== 'string' || !value.trim()) throw new Error('Missing guide content'); }
  function texts(items) { if (!Array.isArray(items) || !items.length) throw new Error('Empty learning section'); items.forEach(text); }
  function source(value) { text(value?.title); if (!value?.url || new URL(value.url).protocol !== 'https:') throw new Error('Source must be HTTPS'); }
  if (!Array.isArray(guides) || !guides.length) throw new Error('No guides');
  for (const guide of guides) {
    id(guide.id);
    if (destinations.has(guide.id)) throw new Error(`Duplicate guide: ${guide.id}`);
    destinations.add(guide.id);
    [guide.title, guide.englishTitle, guide.kind, guide.summary].forEach(text);
    source(guide.source); texts(guide.outcomes);
    if (!Array.isArray(guide.lessons) || !guide.lessons.length) throw new Error('Guide needs lessons');
    for (const lesson of guide.lessons) {
      id(lesson.id);
      const key = `${guide.id}/${lesson.id}`;
      if (destinations.has(key)) throw new Error(`Duplicate lesson: ${key}`);
      destinations.add(key);
      [lesson.title, lesson.objective, lesson.example?.title, lesson.example?.scenario, lesson.example?.prompt, lesson.exercise?.brief].forEach(text);
      if (!Number.isFinite(lesson.minutes) || lesson.minutes <= 0) throw new Error('Invalid lesson time');
      if (!Array.isArray(lesson.sections) || !lesson.sections.length) throw new Error('Lesson needs sections');
      lesson.sections.forEach((section) => { text(section.title); texts(section.paragraphs); });
      [lesson.example.walkthrough, lesson.exercise.steps, lesson.exercise.checks, lesson.pitfalls].forEach(texts);
      if (!Array.isArray(lesson.references) || !lesson.references.length) throw new Error('Lesson needs references');
      lesson.references.forEach(source);
    }
  }
}

function document(title, body, allIds, current = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Serebii Labs 独立编写的中文 AI 工具实战指南；本地讲解和练习支持离线阅读。"><meta name="theme-color" content="#f4f1ea"><title>${escape(title)} · Serebii Labs</title><link rel="icon" href="/learn/icon.svg"><link rel="stylesheet" href="${prefix}course.css"></head><body data-current-lesson="${escape(current)}"><a class="skip-link" href="#main-content">跳到正文</a><main class="shell" id="main-content"><header class="topbar"><a class="brand" href="/"><i class="brand-mark" aria-hidden="true"></i>Serebii Labs</a><nav aria-label="学习导航"><a href="/learn/">AI 学习</a><a href="${prefix}">指南合集</a><a href="/notes/">图解笔记</a></nav><span class="eyebrow">Field guide / 03</span></header>${body}<footer><p>中文讲解、案例与练习：Serebii Labs · 非原课程译版</p><a href="${prefix}SOURCE.md">编写说明与参考来源</a></footer></main><script type="application/json" id="lesson-ids">${JSON.stringify(allIds)}</script><script type="module" src="${prefix}reader.js"></script></body></html>\n`;
}
const offline = `<section class="offline-bar" aria-label="离线阅读"><button class="button" id="save-offline" type="button">保存整个合集，离线阅读</button><span id="offline-status" role="status" aria-live="polite">本地讲解与练习可缓存；运行 AI 和访问参考外链仍需联网。</span></section>`;
const downloads = `<div class="downloads"><a class="button" href="${prefix}workbook.md" download>下载中文练习册 ↓</a><a href="${prefix}practice/">原创练习材料 →</a><span>首次保存后也可断网下载；浏览器清理存储后需重新保存。</span></div>`;
const groups = ['主指南', '短课', '附加指南'];

export async function buildToolkit({ guides, outputRoot, sourceCommit = referenceCommit }) {
  validateGuides(guides);
  if (typeof sourceCommit !== 'string' || !sourceCommit) throw new Error('Missing reference version');
  const totalLessons = guides.reduce((count, guide) => count + guide.lessons.length, 0);
  const allIds = guides.flatMap((guide) => guide.lessons.map((lesson) => `${guide.id}/${lesson.id}`));
  const write = async (path, content) => { const target = resolve(outputRoot, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content); };
  await mkdir(outputRoot, { recursive: true });
  const hero = `<section class="hero"><div><span class="eyebrow">Independent Chinese field guides</span><h1>让 AI<br>进入你的<em>工作流。</em></h1><p class="lede">从文件、研究与决策，到可验证的原型。覆盖 Full Stack PM 免费课程合集的主要主题，用新的中文讲解和独立练习把方法落到手上。</p></div><aside class="hero-note"><span class="eyebrow">Read / Try / Verify</span><strong>${guides.length}</strong><p>个指南分区 · ${totalLessons} 节原创学习单元</p><p>已完成 <span data-progress-total>0</span> / ${totalLessons}<br>学习状态保存在当前浏览器。</p><svg viewBox="0 0 180 68" aria-hidden="true"><rect x="6" y="9" width="46" height="46" rx="3"/><path d="M20 25h18M20 34h12M60 33h18m-6-6 6 6-6 6"/><circle cx="108" cy="33" r="23"/><path d="m96 33 8 8 16-18M138 33h26m-6-6 6 6-6 6"/></svg></aside></section>${offline}${downloads}<section class="intro"><h2>先把边界说清楚</h2><p>这是独立编写的学习指南，不是 Carl Vellotti 原课程的中文翻译、逐章改写或官方授权版本。参考原课程的主题范围，但采用不同的组织方式、虚构案例和练习。没有复制原课程教学脚本、课件或图片；主题覆盖不等于原课程全部课时的复刻。</p><p>可以离线读指南、查看示例、完成纸面练习。调用模型、登录工具、联网研究和部署应用需要网络，也可能需要相应账户权限。界面和功能会变化，具体操作以对应工具的当前官方文档为准。</p></section><section class="study-tools"><label for="guide-search">找一个学习主题</label><input id="guide-search" type="search" placeholder="工具、PRD、数据、知识管理…"><span id="search-count" role="status">${guides.length} 个分区</span></section>`;
  const catalogue = groups.map((kind) => `<section class="catalogue-group"><div class="section-head"><h2>${kind === '主指南' ? '01 / 工具与实践' : kind === '短课' ? '02 / 工作流短课' : '03 / 附加实践'}</h2><p>${guides.filter((guide) => guide.kind === kind).length} 个分区</p></div><div class="guide-grid">${guides.filter((guide) => guide.kind === kind).map((guide) => {
    const index = guides.indexOf(guide);
    const searchText = [guide.title, guide.englishTitle, guide.summary, ...guide.outcomes, ...guide.lessons.flatMap((lesson) => [lesson.title, lesson.objective, ...lesson.sections.flatMap((section) => [section.title, ...section.paragraphs])])].join(' ').toLowerCase();
    return `<a class="guide-card tone-${index % 5}" href="${route(guide)}" data-guide-card data-guide-id="${guide.id}" data-search="${escape(searchText)}"><span class="eyebrow">${String(index + 1).padStart(2, '0')} / ${escape(guide.englishTitle)}</span><h3>${escape(guide.title)}</h3><p>${escape(guide.summary)}</p><span class="card-bottom">${guide.lessons.length} 节 · 已完成 <span data-guide-progress="${guide.id}">0</span>/${guide.lessons.length} · 进入指南 →</span></a>`;
  }).join('')}</div></section>`).join('');
  await write('index.html', document('AI 工具实战：中文原创指南合集', hero + catalogue + '<p id="empty-search" hidden role="status">没有匹配的分区。试试更短的关键词，或清空搜索。</p>', allIds));
  const workbook = ['# AI 工具实战：中文原创练习册', '', '编写：Serebii Labs。非原课程译版。所有案例为独立设计的练习。', '操作工具、访问外链和部署需要联网。练习完成状态应以产物与验收记录为准。', ''];
  for (const guide of guides) {
    const header = `<section class="guide-hero"><span class="eyebrow">${escape(guide.kind)} / ${escape(guide.englishTitle)}</span><h1>${escape(guide.title)}</h1><p class="lede">${escape(guide.summary)}</p><p>${guide.lessons.length} 节 · 建议练习时间 ${guide.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)} 分钟 · 已完成 <span data-guide-progress="${guide.id}">0</span>/${guide.lessons.length}</p></section>${offline}<section class="intro"><h2>学完要能做到</h2>${list(guide.outcomes)}<p class="source-note">主题参考：${external(guide.source)}。下面是本站重新组织的原创学习单元，不与原课程章节逐一对应。</p></section>`;
    const cards = `<section class="lesson-list" aria-label="学习单元">${guide.lessons.map((lesson, index) => `<a href="${route(guide, lesson)}" class="lesson-link"><span class="eyebrow">${String(index + 1).padStart(2, '0')}</span><div><h2>${escape(lesson.title)}</h2><p>${escape(lesson.objective)}</p></div><span>${lesson.minutes} 分钟 →</span></a>`).join('')}</section>${downloads}<nav class="bottom-nav" aria-label="返回合集"><a href="${prefix}">← 全部指南</a></nav>`;
    await write(`${guide.id}/index.html`, document(guide.title, header + cards, allIds));
    workbook.push(`## ${guide.title}`, '');
    for (const [index, lesson] of guide.lessons.entries()) {
      const key = `${guide.id}/${lesson.id}`;
      const sidebar = `<aside class="contents"><span class="eyebrow">Contents / 本指南</span><nav aria-label="本指南章节">${guide.lessons.map((item, position) => `<a href="${route(guide, item)}" ${item.id === lesson.id ? 'aria-current="page"' : ''}>${String(position + 1).padStart(2, '0')} ${escape(item.title)}</a>`).join('')}</nav><a href="${route(guide)}">↑ 分区目录</a></aside>`;
      const article = `<article class="lesson-article"><header><span class="eyebrow">${escape(guide.englishTitle)} / ${String(index + 1).padStart(2, '0')}</span><h1>${escape(lesson.title)}</h1><p class="lesson-goal">${escape(lesson.objective)}</p><p class="small">建议 ${lesson.minutes} 分钟 · 案例为虚构练习，不是实际业务数据。</p></header>${lesson.sections.map((section) => `<section class="prose"><h2>${escape(section.title)}</h2>${section.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}</section>`).join('')}<section class="example tone-0"><span class="eyebrow">Worked example / 原创案例</span><h2>${escape(lesson.example.title)}</h2><p>${escape(lesson.example.scenario)}</p><h3>可尝试的任务说明</h3><pre>${escape(lesson.example.prompt)}</pre><h3>怎么看结果</h3>${list(lesson.example.walkthrough, true)}</section><section class="exercise tone-3"><span class="eyebrow">Your turn / 动手练习</span><h2>${escape(lesson.exercise.brief)}</h2>${list(lesson.exercise.steps, true)}<h3>验收清单</h3>${list(lesson.exercise.checks)}<label class="completion"><input type="checkbox" data-lesson-check="${key}"> 我已完成练习，并逐项核对验收清单</label><p id="progress-status" role="status" aria-live="polite">完成状态仅保存在当前浏览器；不代表工具或平台认证。</p></section><section class="prose"><h2>容易踩的坑</h2>${list(lesson.pitfalls)}</section><section class="references"><h2>参考与进一步核对</h2><p>原课程主题入口：${external(guide.source)}。以下为工具或方法的核对资料，访问需要联网。</p><ul>${lesson.references.map((reference) => `<li>${external(reference)}</li>`).join('')}</ul></section><nav class="lesson-pagination" aria-label="学习单元切换">${index ? `<a href="${route(guide, guide.lessons[index - 1])}">← 上一节：${escape(guide.lessons[index - 1].title)}</a>` : `<a href="${route(guide)}">← 本指南目录</a>`}${index < guide.lessons.length - 1 ? `<a href="${route(guide, guide.lessons[index + 1])}">下一节：${escape(guide.lessons[index + 1].title)} →</a>` : `<a href="${prefix}">返回合集，选择下一条路径 →</a>`}</nav></article>`;
      await write(`${guide.id}/${lesson.id}/index.html`, document(lesson.title, offline + `<div class="reading-layout">${sidebar}${article}</div>`, allIds, key));
      workbook.push(`### ${index + 1}. ${lesson.title}`, '', lesson.objective, '', `任务：${lesson.exercise.brief}`, ...lesson.exercise.steps.map((step, number) => `${number + 1}. ${step}`), '', '验收：', ...lesson.exercise.checks.map((check) => `- [ ] ${check}`), '', `本地页面：${route(guide, lesson)}`, '');
    }
  }
  await write('workbook.md', workbook.join('\n'));
  const coverage = { referenceRepository: 'https://github.com/carlvellotti/free-ai-courses', sourceCommit, checkedAt: '2026-10-13', edition: '独立原创中文指南，非原课程译版', totalLessons, guides: guides.map((guide) => ({ id: guide.id, title: guide.title, kind: guide.kind, source: guide.source, lessons: guide.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, minutes: lesson.minutes })) })) };
  await write('coverage.json', JSON.stringify(coverage, null, 2) + '\n');
  await write('SOURCE.md', `# AI 工具实战：编写说明与参考来源\n\n编写：Serebii Labs\n核对日期：2026-10-13\n\n## 材料性质\n\n本合集为独立编写的中文学习指南，不是 Carl Vellotti / Full Stack PM 原课程的翻译、逐章改写、授权镜像或官方版本。仅参考公开课程的主题范围，并使用独立组织方式、虚构案例、练习及验收要求。主题覆盖不表示复刻原课程每一课时。没有复制原课程脚本、课件、图片或练习文件。\n\n原仓库：https://github.com/carlvellotti/free-ai-courses\n参考快照：${sourceCommit}\n原课程授权：CC BY-NC-ND 4.0（署名、非商业、禁止分发改编版）。本合集不取得或替代原课程授权；原作者不为本指南背书。\n\n本站原创正文和练习的编写归属为 Serebii Labs；第三方工具名、链接与被引用资料的权利归各自权利人。不将原课程许可证误用于本站原创内容，也不将本站内容声明为原作者提供。\n\n## 分区与主题入口\n\n${guides.map((guide) => `- ${guide.title}：${guide.source.url}（${guide.lessons.length} 节独立学习单元）`).join('\n')}\n\n共 ${guides.length} 个分区、${totalLessons} 节原创学习单元。每节参考资料列于页面末尾，工具能力与界面以当前官方文档为准。\n\n## 离线范围\n\n保存合集后，所有本地指南、练习、样式、脚本、来源说明与练习册可断网阅读。外部原课程与官方资料没有复制到缓存；调用 AI、联网研究、账户登录和部署仍需网络。浏览器可能清理缓存，必要时联网重新保存。学习完成状态保存在当前浏览器，不跨设备同步。\n`);
  for (const file of ['course.css', 'reader.js', 'reader-core.mjs']) {
    const original = resolve(repository, 'learn/ai-toolkit', file);
    if (resolve(outputRoot, file) !== original) await write(file, await readFile(original));
  }
  const practice = [
    ['project-brief.md', '# 原创练习背景：街区活动报名\n\n这是虚构练习，不是实际业务数据。组织者希望让居民报名周末活动。第一版只展示活动、提交本地演示报名，并显示确认状态。不要收集真实身份信息、接支付或发送真实邮件。\n\n验收：未填必填项时给出提示；名额耗尽时禁止提交；报名成功后状态清晰；说明刷新后是否保留。\n'],
    ['meeting.md', '# 原创模拟纪要\n\n周一：小林提出增加报名提醒。小周担心未取得邮件同意。阿宁说先做不发邮件的页面原型。主持人决定本周验证报名流程；提醒功能仅列为候选，不承诺上线。小林负责周五前提供原型反馈。\n\n练习：将事实、决定、候选建议、负责人和截止时间分开，不添加不存在的决定。\n'],
    ['interviews.md', '# 原创模拟反馈\n\n用户 A：报名按钮藏在底部，我看到了活动但没找到入口。\n用户 B：人数满了还让我填表，最后才告诉我不能报名。\n用户 C：我重复点击提交，不知道第一次是否成功。\n\n样本只有三条，不能据此声称代表所有用户；标注证据 ID 与需要进一步验证的假设。\n'],
    ['funnel.csv', 'step,entered,completed\nview_event,100,60\nopen_form,60,30\nsubmit_form,30,24\n'],
    ['experiment.csv', 'segment,group,users,completed\nnew,control,40,12\nnew,treatment,40,18\nreturning,control,10,8\nreturning,treatment,10,7\n'],
    ['style-brief.md', '# 原创视觉练习说明\n\n街区活动封面：纸张底色、黑色主标题、浅蓝和淡绿区域、细边框。每张封面保留活动名称、日期与地点；不要把模型生成的文字当最终排版。\n\n验收：两张不同主题封面保持相同颜色与留白；图像无真实居民肖像；关键信息用可编辑文字层补齐；记录素材来源。\n'],
    ['evidence-ledger.csv', 'claim,source_url,checked_at,evidence,status\n示例结论待核验,,,填写支持证据或标记缺失,unverified\n'],
    ['review-template.md', '# 原创产物验收模板\n\n任务目标：\n输入与授权范围：\n输出位置：\n测试或人工核对记录：\n已满足的验收项：\n未满足或不确定项：\n需要人工批准的后续动作：\n回退方法：\n'],
  ];
  for (const [name, content] of practice) await write(`practice/${name}`, content);
  await write('practice/index.html', document('原创练习材料', `<section class="guide-hero"><span class="eyebrow">Practice inputs / Original fixtures</span><h1>先有材料，<br>再做<em>判断。</em></h1><p class="lede">这组虚构材料供自由练习；各单元也提供独立案例，可按单元说明自行构造输入。不要把模拟数字或意见当作真实业务证据。</p></section>${offline}<section class="lesson-list">${practice.map(([name]) => `<a class="lesson-link" href="${prefix}practice/${name}" download><span class="eyebrow">INPUT</span><h2>${name}</h2><span>下载 ↓</span></a>`).join('')}</section><section class="intro"><h2>数据的手算检查</h2><p>funnel.csv：表单提交率为 24/30=80%；从查看活动到最终提交为 24/100=24%。experiment.csv：对照组共 20/50=40%，实验组共 25/50=50%；新用户分别为 30% 与 45%，回访用户分别为 80% 与 70%。这些是练习用描述统计，不足以直接宣称显著性、因果关系或稳定的上线收益。</p></section>${downloads}`, allIds));
  await write('offline-manifest.json', JSON.stringify(await buildManifest(outputRoot, prefix, sourceCommit), null, 2) + '\n');
  return coverage;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const contentFiles = ['guides-claude.mjs', 'guides-builders.mjs', 'guides-workflows.mjs'];
  const guides = [];
  for (const file of contentFiles) guides.push(...(await import(pathToFileURL(resolve(repository, 'learn/ai-toolkit', file)))).default);
  const coverage = await buildToolkit({ guides, outputRoot: resolve(repository, 'learn/ai-toolkit') });
  console.log(JSON.stringify({ guides: coverage.guides.length, lessons: coverage.totalLessons }));
}
