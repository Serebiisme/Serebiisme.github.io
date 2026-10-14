import {readFile,writeFile,mkdir,readdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {renderLessonMarkdown} from './markdown.mjs';
import {safeRelative,verifyInventory} from './source.mjs';
import {validateEditorial} from './editorial.mjs';

const BASE='/learn/ai-from-scratch/';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash=b=>createHash('sha256').update(b).digest('hex');
const phaseNames=['环境与工具','数学基础','机器学习基础','深度学习核心','计算机视觉','自然语言处理','语音与音频','深入 Transformer','生成式 AI','强化学习','从零构建大语言模型','大语言模型工程','多模态 AI','工具与协议','Agent 工程','自主系统','多 Agent 与群体','基础设施与生产','伦理、安全与对齐','综合项目'];
const phaseTitle=p=>phaseNames[Number(p.id.slice(0,2))]??p.id;
async function walk(root){let result=[];for(const e of await readdir(root,{withFileTypes:true})){const p=resolve(root,e.name);if(e.isSymbolicLink())throw new Error('Symlink asset');if(e.isDirectory())result.push(...await walk(p));else if(e.isFile())result.push(p);}return result;}

export async function buildCourse({catalog,sourceRoot,translationRoot=sourceRoot,editionRoot,outputRoot,editorial={records:[]},sourceCommit='f0c979b98d35f0547fe7a5f9aadf2f25d6c2e375',translationCommit='cf05bd927ba34d7d8be6d4875f12994fd2021e81',figures={}}){
  const records=new Map(editorial.records.filter(r=>r.status==='reviewed').map(r=>[r.lessonId,r]));
  const report={lessonPages:0,projectPages:0,quizCount:0,reviewed:records.size,draft:catalog.lessons.length-records.size,unresolved:[],bytes:0};
  const groups=new Map(),packs=[],routes={};
  const shared='ai-from-scratch';groups.set(shared,new Set());
  const out=path=>resolve(outputRoot,safeRelative(path));
  async function write(path,data,group=shared){await mkdir(dirname(out(path)),{recursive:true});await writeFile(out(path),data);if(group)groups.get(group).add(BASE+path);}
  async function copy(path,from,group){await write(path,await readFile(from),group);}
  function layout(title,body,{pack=shared,lessonId='',projectId=''}={}){
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="从零构建 AI 工程：全量英文与中文草稿，明确校订状态，按需离线阅读。"><link rel="icon" href="/learn/icon.svg"><link rel="stylesheet" href="${BASE}styles.css"><link rel="stylesheet" href="${BASE}vendor/katex/katex.min.css"><title>${esc(title)} · Serebii Labs</title></head><body data-pack="${esc(pack)}" data-lesson="${esc(lessonId)}" data-project="${esc(projectId)}"><main class="shell"><header class="topbar"><a class="brand" href="/">● Serebii Labs</a><nav aria-label="学习导航"><a href="/learn/">AI 学习</a><a href="/notes/">图解笔记</a><a href="${BASE}">课程首页</a></nav><span class="eyebrow">FROM SCRATCH / 04</span></header>${body}<footer><p>原作者 Rohit Ghumare · MIT · Copyright (c) 2026 Rohit Ghumare</p><p><a href="${BASE}SOURCE.md">来源与修改说明</a> · <a href="${BASE}LICENSE">完整许可</a> · <a href="${BASE}THIRD-PARTY.md">第三方依赖</a></p><p>浏览器可能清理缓存；离线阅读不等于代码可断网运行。所有课程代码运行未验证。</p></footer></main><script type="module" src="${BASE}reader.js"></script></body></html>`;
  }
  function saveControl(label='保存本包'){return `<div class="save-panel"><button type="button" data-save>${label}</button><span data-save-status role="status">未检测离线状态</span></div>`;}
  function lessonList(lessons){return `<ol class="lesson-list">${lessons.map(l=>`<li data-id="${esc(l.id)}"><a href="${BASE}lessons/${l.id}/"><span class="eyebrow">${esc(l.slug.slice(0,2))}</span><strong>${esc(records.get(l.id)?.titleZh??l.titleZh)}</strong><small>${esc(l.titleEn)} · ${records.has(l.id)?'中文已校订':'中文草稿 · 待校订'}</small></a></li>`).join('')}</ol>`;}
  const routeMap=new Map();
  for(const l of catalog.lessons){routeMap.set(l.englishPath,BASE+'lessons/'+l.id+'/');routeMap.set(l.draftPath,BASE+'lessons/'+l.id+'/');}
  for(const p of catalog.projects){routeMap.set(p.readmePath,BASE+'projects/'+p.id+'/');for(const s of p.stageDocPaths)routeMap.set(s,BASE+'projects/'+p.id+'/#'+s.split('/')[3]);}
  const copied=new Map();
  async function render(markdown,sourcePath,group,id){
    const pending=[];
    const resolveLink=(href,image)=>{
      if(/[%\\\x00-\x1f]/.test(href))return null;
      const [raw,anchor]=href.split('#');
      let path=posix.normalize(raw.startsWith('/')?raw.slice(1):posix.join(posix.dirname(sourcePath),raw));
      if(path.startsWith('../')||path.startsWith('/'))return null;
      if(routeMap.has(path))return routeMap.get(path)+(anchor?'#'+encodeURIComponent(anchor):'');
      const source=resolve(sourceRoot,path);
      const file=BASE+'files/'+path;
      pending.push({path,source,file,image});return file+(anchor?'#'+encodeURIComponent(anchor):'');
    };
    const result=renderLessonMarkdown({markdown,lessonId:id,resolveLink,figures});
    for(const x of pending){
      try{
        const bytes=await readFile(x.source);
        if(x.image&&x.path.endsWith('.svg')&&/<script|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|javascript:)|<foreignObject/i.test(bytes.toString()))throw new Error('Unsafe SVG');
        await write('files/'+safeRelative(x.path),bytes,group);copied.set(x.path,true);
      }catch(e){if(x.image){report.unresolved.push({lessonId:id,type:'image',key:x.path,reason:e.message});}else{
        result.html=result.html.split(esc(x.file)).join(esc(`https://github.com/rohitg00/ai-engineering-from-scratch/blob/${sourceCommit}/${x.path}`));
        result.html+=`<p class="small">范围外或未镜像的引用 ${esc(x.path)} ↗ 需要联网。</p>`;
      }}
    }
    for(const asset of result.referencedAssets)groups.get(group).add(asset);
    report.unresolved.push(...result.unresolved);return result.html;
  }
  await mkdir(outputRoot,{recursive:true});
  for(const file of ['styles.css','reader.js'])await copy(file,resolve('scripts/from-scratch/templates',file),shared);
  await copy('reader-core.mjs',resolve('scripts/from-scratch/reader-core.mjs'),shared);
  const katexDir=resolve('node_modules/katex/dist');
  for(const file of await walk(resolve(katexDir,'fonts')))await copy('vendor/katex/fonts/'+posix.basename(file),file,shared);
  await copy('vendor/katex/katex.min.css',resolve(katexDir,'katex.min.css'),shared);
  const license=await readFile(resolve(sourceRoot,'LICENSE'),'utf8');await write('LICENSE',license);
  await write('SOURCE.md',`# 从零构建 AI 工程：来源与修改\n\n原作者：Rohit Ghumare。Copyright (c) 2026 Rohit Ghumare。原材料 MIT；完整许可见 LICENSE。\n\n英文/代码固定版本：${sourceCommit}\n中文草稿固定版本：${translationCommit}\n来源：https://github.com/rohitg00/ai-engineering-from-scratch\n\n本站修改：安全静态双语阅读器、公式与图解静态渲染、按需离线保存、练习下载与中文导读。${records.size}/${catalog.lessons.length} 课中文全文已校订，其余为机器翻译草稿，建议对照英文。测验保持原始英文、选项与答案，不冒充已翻译。所有代码运行未验证。20 阶段、528 课、378 份原测验、76 个正式项目；作者模板不计入项目。\n\n不镜像外部模型、数据集或论文；外链需要联网。原交互图仅保留默认状态静态快照，不包含动画或滑块。无上游安装器或 Skill 被执行。\n`);
  await write('THIRD-PARTY.md','# 第三方依赖\n\n本站 Markdown 构建：markdown-it 15.0.2（MIT）。公式：KaTeX 0.19.0（MIT）与附带字体（见 vendor/katex/LICENSE）。图解：原作者 MIT drawing providers、Mermaid 12.1.0（MIT，仅构建时）；打包：fflate 0.8.3（MIT）。依赖完整版权许可见 vendor/licenses/。外部资料未镜像，依原站条款在线访问。\n');
  for(const name of ['markdown-it','katex','mermaid','fflate']){
    const dir=resolve('node_modules',name);const candidates=['LICENSE','LICENSE.md','LICENSE.txt'];
    for(const candidate of candidates){try{await copy(`vendor/licenses/${name}.txt`,resolve(dir,candidate),shared);break;}catch(e){if(e.code!=='ENOENT')throw e;}}
  }
  await copy('vendor/katex/LICENSE',resolve('node_modules/katex/LICENSE'),shared);
  const search=await Promise.all(catalog.lessons.map(async l=>{
    const record=records.get(l.id),en=await readFile(resolve(sourceRoot,l.englishPath),'utf8'),zh=await readFile(record?resolve(editionRoot,l.id+'.md'):resolve(translationRoot,l.draftPath),'utf8');
    const terms=[l.id.replace(/-/g,' '),phaseTitle(catalog.phases.find(p=>p.id===l.phaseId)),en,zh].join(' ').replace(/```[\s\S]*?```/g,' ').replace(/\s+/g,' ');
    return {id:l.id,titleZh:record?.titleZh??l.titleZh,titleEn:l.titleEn,terms,phaseId:l.phaseId,status:record?'reviewed':'draft'};
  }));
  await write('search.json',JSON.stringify(search));
  await write('lesson-index.json',JSON.stringify(search.map(({id})=>({id}))));
  const phaseCards=catalog.phases.map(p=>`<a class="tile" href="${BASE}phases/${p.id}/"><span class="eyebrow">PHASE ${p.id.slice(0,2)}</span><h2>${esc(phaseTitle(p))}</h2><p>${p.lessons.length} 课 · 按需保存</p></a>`).join('');
  await write('index.html',layout('从零构建 AI 工程',`<section class="hero"><div><p class="eyebrow">20 PHASES · 528 LESSONS · 76 PROJECTS</p><h1>从零构建<br><em>AI 工程</em>。</h1><p>沿原课程的完整课序，从数学与深度学习走向 LLM、Agent 和生产系统。</p></div><aside class="cover"><span>00 → 19</span><svg viewBox="0 0 300 200" aria-hidden="true"><path d="M20 180h60v-40h60v-40h60V60h60V20" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="260" cy="20" r="14" fill="#d9ff53" stroke="currentColor"/></svg></aside></section><p class="notice">中文已校订 ${records.size}/${catalog.lessons.length} 课 · ${catalog.lessons.length-records.size} 课为中文草稿，尚未校订。每课均保留完整英文对照。所有代码运行未验证。</p>${saveControl('保存共享阅读器')}<p><button data-save-all type="button">保存全部阅读内容</button> <span data-total-size></span></p><p class="small">保存所有阶段与项目阅读页，不包含 ZIP、模型或数据。练习 ZIP 可另行下载；浏览器空间不足时会提示失败，不清理其他课程。</p><div class="section-head"><h2>课程阶段 / Phases</h2><a href="${BASE}projects/">76 个项目资料 →</a></div><div class="tiles">${phaseCards}</div><section class="search"><h2>在课程里找一个概念</h2><label for="search">中文、英文或术语</label><input id="search" type="search" placeholder="试试 RAG、向量、attention"><p data-progress-summary></p><div data-search-results></div></section>`));
  for(const phase of catalog.phases){
    const pack='ai-from-scratch-phase-'+phase.id;groups.set(pack,new Set());
    const lessons=catalog.lessons.filter(l=>l.phaseId===phase.id);
    await write(`phases/${phase.id}/index.html`,layout(phaseTitle(phase),`<p class="eyebrow">PHASE ${phase.id.slice(0,2)}</p><h1>${esc(phaseTitle(phase))}</h1><p>${lessons.length} 课 · 英文全文与中文草稿/校订对照</p>${saveControl('保存本阶段')}${lessonList(lessons)}`,{pack}),shared);
    for(const lesson of lessons){
      const index=catalog.lessons.indexOf(lesson), record=records.get(lesson.id);
      const en=await readFile(resolve(sourceRoot,lesson.englishPath),'utf8');
      const zh=await readFile(record?resolve(editionRoot,lesson.id+'.md'):resolve(translationRoot,lesson.draftPath),'utf8');
      const original=`https://github.com/rohitg00/ai-engineering-from-scratch/blob/${sourceCommit}/${lesson.englishPath}`;
      const enHTML=await render(en,lesson.englishPath,pack,lesson.id),zhHTML=await render(zh,lesson.englishPath,pack,lesson.id);
      const paths=[...lesson.codePaths,...lesson.outputPaths];
      const files={};let downloads='';
      for(const path of paths){const data=await readFile(resolve(sourceRoot,safeRelative(path)));files[path]=new Uint8Array(data);await write('files/'+path,data,pack);downloads+=`<li><a download href="${BASE}files/${esc(path)}">${esc(path)}</a><details><summary>查看原始文本</summary><pre><code>${esc(data.toString())}</code></pre></details></li>`;}
      files['LICENSE']=strToU8(license);files['OFFLINE-README.zh.txt']=strToU8(`本包只提供公开课件与代码，运行未验证。来源 ${sourceCommit}。在解压根目录中按原课文的 phases/${lesson.id} 工作目录与命令运行。需预装语言/依赖；模型、数据、API 和联网服务未附带。不要把真实密钥提交或填入本站。`);
      await write('downloads/lesson-'+lesson.id.replace('/','--')+'.zip',zipSync(files,{level:6}),null);
      let quizHTML='<p>原课程未提供测验。</p>';
      if(lesson.quizPath){const originalQuiz=JSON.parse(await readFile(resolve(sourceRoot,lesson.quizPath),'utf8'));const questions=Array.isArray(originalQuiz)?originalQuiz:originalQuiz.questions;
        await write('lessons/'+lesson.id+'/quiz.json',JSON.stringify(questions),pack);report.quizCount++;
        quizHTML=`<p>原作者英文测验 · 未翻译，不与中文校订状态混淆</p><form data-quiz>${questions.map((q,i)=>`<fieldset><legend>${i+1}. ${esc(q.question)}</legend>${q.options.map((o,j)=>`<label class="option"><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join('')}<p data-feedback="${i}"></p></fieldset>`).join('')}<button type="submit">检查答案</button><p data-quiz-score role="status"></p></form>`;
      }
      const title=record?.titleZh??lesson.titleZh;
      const body=`<p class="eyebrow"><a href="${BASE}phases/${lesson.phaseId}/">${esc(phaseTitle(phase))}</a> / LESSON ${lesson.slug.slice(0,2)}</p><h1 class="lesson-title">${esc(title)}</h1><p>${esc(lesson.titleEn)}</p><p class="notice" data-editorial-status>${record?'中文已校订（全文）':'中文草稿 · 待校订：机器翻译可能包含术语或语义错误，请对照英文。'} · 可按阶段保存离线阅读 · 运行未验证</p>${saveControl('保存本阶段')}<div class="reader-tools"><button type="button" data-language="zh" aria-pressed="true">中文${record?'校订版':'草稿'}</button><button type="button" data-language="en" aria-pressed="false">英文原文</button><button type="button" data-complete>标记读完</button></div><article data-lang="zh" class="prose">${zhHTML}</article><article data-lang="en" class="prose" hidden lang="en">${enHTML}</article><section><h2>练习与源文件</h2><p>运行条件：需按原课准备依赖；涉及模型/数据/API 的实验仍需事先下载或联网服务。本站仅提供阅读与文件下载，代码运行未验证。</p><a download href="${BASE}downloads/lesson-${lesson.id.replace('/','--')}.zip">下载本课代码练习 ZIP（需联网，或单独保存）</a><button type="button" data-save-download="${BASE}downloads/lesson-${lesson.id.replace('/','--')}.zip">单独保存本课 ZIP</button><ul>${downloads||'<li>本课无独立代码文件</li>'}</ul></section><section class="quiz"><h2>测验 / Quiz</h2>${quizHTML}</section><nav class="pager" aria-label="课序">${index>0?`<a href="${BASE}lessons/${catalog.lessons[index-1].id}/">← 上一课</a>`:''}${index<catalog.lessons.length-1?`<a href="${BASE}lessons/${catalog.lessons[index+1].id}/">下一课 →</a>`:''}</nav><p class="small"><a href="${original}" rel="noreferrer">英文原文 ↗ 需要联网</a> · 固定版本 ${sourceCommit.slice(0,7)}</p>`;
      await write('lessons/'+lesson.id+'/index.html',layout(title,body,{pack,lessonId:lesson.id}),pack);report.lessonPages++;
    }
  }
  await write('projects/index.html',layout('项目实践',`<p class="eyebrow">PROJECT LAB / 76</p><h1>把知识<br><em>做出来</em>。</h1><p>76 个正式项目，英文原始说明与阶段任务完整保留。中文导读仅解释使用方式，不冒充已翻译全文。代码运行未验证；作者模板不算课程。</p><div class="tiles">${catalog.projects.map((p,i)=>`<a class="tile" href="${BASE}projects/${p.id}/"><span class="eyebrow">PROJECT ${String(i+1).padStart(2,'0')}</span><h2>${esc(p.titleEn)}</h2><p>${p.stageDocPaths.length} 阶段 · 原文完整保留</p></a>`).join('')}</div>`));
  for(const project of catalog.projects){
    const pack='ai-from-scratch-project-'+project.id;groups.set(pack,new Set());
    const readme=await readFile(resolve(sourceRoot,project.readmePath),'utf8');
    const original=await render(readme,project.readmePath,pack,project.id);let stages='';
    for(const path of project.stageDocPaths){const text=await readFile(resolve(sourceRoot,path),'utf8');stages+=`<section id="${esc(path.split('/')[3])}"><h2>${esc(path.split('/')[3])} · 原始阶段说明</h2><div class="prose" lang="en">${await render(text,path,pack,project.id)}</div></section>`;}
    const paths=(await walk(resolve(sourceRoot,'projects',project.id))).map(p=>posix.relative(sourceRoot,p));
    const files={};for(const path of paths)files[path]=new Uint8Array(await readFile(resolve(sourceRoot,path)));
    for(const path of ['scripts/project_test.py','scripts/_lib.py','scripts/lesson_run.py','scripts/run_lesson_tests.py','requirements.txt'])try{files[path]=new Uint8Array(await readFile(resolve(sourceRoot,path)));}catch(e){if(e.code!=='ENOENT')throw e;}
    files['LICENSE']=strToU8(license);files['OFFLINE-README.zh.txt']=strToU8(`项目 ${project.titleEn}，固定来源 ${sourceCommit}。从解压根目录阅读 projects/${project.id}/README.md，并按其工作目录执行命令。starter 为练习骨架（若原项目提供），solution 为参考答案；stages 包含原始任务/评分器。公共 scripts/ 已附带。代码运行未验证。预装依赖、外部模型、数据集或 API 服务由读者另行准备，不保证断网可运行。`);
    await write('downloads/project-'+project.id+'.zip',zipSync(files,{level:6}),null);
    const body=`<p class="eyebrow">PROJECT / ${esc(project.id)}</p><h1 class="lesson-title">${esc(project.titleEn)}</h1><p class="notice">本站中文导读 + 原作者英文全文 · 代码运行未验证</p><p>这是原课程的「${esc(project.titleEn)}」实践项目。先阅读下方原始目标与阶段说明，再按课序实现功能、运行评分器并比较参考实现。英文全文未缩写；中文长文尚未翻译。</p><p>练习骨架 starter：${project.starterPaths.length?'原项目提供，见 ZIP':'原项目未提供，勿将 solution 当作骨架'}；参考实现 solution：${project.solutionPaths.length} 个文件。运行前按 README 准备依赖与输入；模型、数据或在线服务不包含在离线阅读包中。</p>${saveControl('保存本项目阅读资料')}<p><a download href="${BASE}downloads/project-${project.id}.zip">下载完整项目 ZIP（需联网，或单独保存）</a> <button data-save-download="${BASE}downloads/project-${project.id}.zip" type="button">单独保存项目 ZIP</button></p><section><h2>学习目标（原作者）</h2><ul>${(project.metadata.skills??[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section class="prose" lang="en">${original}</section>${stages}`;
    await write('projects/'+project.id+'/index.html',layout(project.titleEn,body,{pack,projectId:project.id}),pack);report.projectPages++;
  }
  // Manifests are not included in their own hashes. ZIP downloads are separate
  // explicit operations, never part of the full reading save.
  groups.get(shared).add(BASE+'packs.json');
  for(const [id,assets]of groups){
    const kind=id===shared?'shared':id.startsWith(shared+'-phase-')?'phase':'project';
    const manifestPath=`manifests/${id}.json`;
    let bytes=0;const digest=createHash('sha256');
    for(const asset of [...assets].sort()){if(asset.endsWith('/packs.json'))continue;const b=await readFile(out(asset.slice(BASE.length)));bytes+=b.length;digest.update(asset).update(b);}
    const version=digest.digest('hex').slice(0,20);
    const pack={id,kind,manifestUrl:BASE+manifestPath,dependencies:kind==='shared'?[]:[shared],bytes,assetsCount:assets.size,version};packs.push(pack);
    for(const asset of assets)(routes[asset]??=[]).push(id);
    await write(manifestPath,JSON.stringify({packId:id,version,sourceCommit,assets:[...assets].sort()}),null);
  }
  // Registry references the shared version, so hash its independent semantics
  // (other pack versions + route ownership) rather than a circular JSON hash.
  const sharedPack=packs[0],sharedBaseBytes=sharedPack.bytes;
  sharedPack.version=hash(sharedPack.version+JSON.stringify(packs.slice(1))+JSON.stringify(routes)).slice(0,20);
  for(let i=0;i<20;i++){const actual=sharedBaseBytes+Buffer.byteLength(JSON.stringify({sourceCommit,packs,routes}));if(sharedPack.bytes===actual)break;sharedPack.bytes=actual;}
  await write('manifests/'+shared+'.json',JSON.stringify({packId:shared,version:sharedPack.version,sourceCommit,assets:[...groups.get(shared)].sort()}),null);
  await write('packs.json',JSON.stringify({sourceCommit,packs,routes}),null);
  await write('build-report.json',JSON.stringify(report),null);
  report.bytes=(await Promise.all((await walk(outputRoot)).map(p=>stat(p)))).reduce((s,x)=>s+x.size,0);
  if(report.unresolved.length)throw new Error('Unresolved resources: '+JSON.stringify(report.unresolved));
  return report;
}

async function main(){
 const content=resolve('content/ai-from-scratch');const load=name=>readFile(resolve(content,name),'utf8').then(JSON.parse);
 const catalog=await load('catalog.json'),inventory=await load('inventory.json'),editorial=await load('editorial.json'),lock=await load('source-lock.json');
 await verifyInventory({root:content,inventory});
 const status=await validateEditorial({catalog,records:editorial.records,readText:path=>readFile(resolve(content,safeRelative(path)))});
 if(status.blockers.length||status.staleIds.length)throw new Error('Invalid editorial records');
 if(status.reviewed!==status.total&&(!process.argv.includes('--allow-drafts')||process.argv.includes('--require-reviewed')))throw new Error('Full Chinese review incomplete; explicit --allow-drafts required');
 const figures=JSON.parse(await readFile(resolve('learn/ai-from-scratch/figures.json'),'utf8'));
 const report=await buildCourse({catalog,inventory,editorial,sourceRoot:resolve(content,'upstream/en'),translationRoot:resolve(content,'upstream/zh'),editionRoot:resolve(content,'editions'),outputRoot:resolve('learn/ai-from-scratch'),...lock,figures});
 console.log(JSON.stringify(report));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
