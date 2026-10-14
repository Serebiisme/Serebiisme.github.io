# 从零构建 AI 工程离线课程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Serebii Labs 发布原课程 20 阶段、528 课的中文校订/英文对照离线阅读版，并收纳 77 个项目资料与可下载练习包。

**Architecture:** 固定来源导入器将英文、中文草稿、代码和测验形成可追溯本地快照；中文校订层与上游分离。构建器生成同源静态页与共享/阶段/项目 manifest，复用现有 Service Worker 消息协议，按需保存，不移植上游服务端或整站。

**Tech Stack:** Node.js ESM、node:test、静态 HTML/CSS/JavaScript、CacheStorage、Service Worker。拟锁定 markdown-it 15.0.2、KaTeX 0.19.0、Mermaid 12.1.0、fflate 0.8.3；这些版本于 2026-10-14 经 npm registry 查询，安装时记录 package-lock.json。Mermaid 仅在隔离的本地浏览器中构建 SVG；网页运行不依赖 CDN。Chrome/Playwright 用于浏览器验收，不作为课程运行依赖。

**Spec:** `docs/superpowers/specs/2026-10-14-ai-engineering-from-scratch-offline-design.md`（2026-10-14 用户已确认）。

## Global Constraints

- 英文与代码快照：`f0c979b98d35f0547fe7a5f9aadf2f25d6c2e375`；中文快照：`cf05bd927ba34d7d8be6d4875f12994fd2021e81`。
- 主课程：20 阶段、528 篇课文、378 份已有测验；项目：77 个清单。缺失原测验不能编造为原作者测验。
- 路由 `/learn/ai-from-scratch/`；新专辑「从零构建 AI 工程」，淡绿卡片与阶段阶梯几何图；原三门课程保留。
- 忠实翻译/校订全文，英文原文不修改；最终「中文校订版完成」门槛为 528/528 已校订，术语替换和文件存在不算完成。
- 项目提供中文简介/目标及英文全文；不承诺 77 个项目长文已全译。未经执行的代码标为「运行未验证」。
- 不收录 certifications、manuals、博客、广告、外部收费材料、模型权重或外部数据集；第三方许可独立核对。
- 保留 MIT 完整许可、Copyright (c) 2026 Rohit Ghumare、来源 SHA 与本站修改说明；不安装上游 Skill 或运行上游脚本。
- 新课程显式按需保存，不在学习库自动下载。`CACHE_COURSE`、`CACHE_PROGRESS`、`CACHE_READY`、`CACHE_ERROR` 协议保持兼容。
- 更新失败保留完整旧版本；不删除其他阶段、项目或课程缓存。浏览器缓存不等于永久保存。
- 页面安全转义，同源内容/资源，无任意源 HTML/JS 执行、路径穿越或网页收集 API key。
- 原站主题；320、390、768、1440 像素验收；`npm test` 全套执行；全部已保存阅读页须断网验证。
- 发布保持 `Serebiisme/Serebiisme.github.io` 的 `master:/`，正常精确提交推送；未完成的预览默认仅本地，不擅自发布。

## Review Focus

1. 中文文件与英文不是同一更新批次：以源正文哈希记录逐课校订版本，过期校订拒绝计为完成（Task 2）。
2. 原文含 `figure` 自定义块、图像、公式或未收录章节链接：不能静默丢图或出现断网坏链，逐项记录与验证（Task 3）。
3. 新缓存尚未写完/用户中途断网：不读取半成品缓存、保留旧版，不连带清理别的阶段（Task 4）。
4. 用户直达深层课程页且尚未打开课程库：阶段保存须先取得共享资源；刷新后不能靠旧 localStorage 误报已保存（Task 4）。
5. 用户已有旧 Service Worker 与已保存三门课程：升级导入模块刷新且原缓存/进度保留，学习库不触发大包下载（Task 5、6）。

## 文件与接口地图

- `content/ai-from-scratch/source-lock.json`：固定仓库、两个 SHA、预期计数；`upstream/en/` 与 `upstream/zh/`：不可变原始文件；`inventory.json`：逐文件路径、来源、字节数、SHA-256。
- `content/ai-from-scratch/catalog.json`：阶段、课序、项目、代码/测验/资源引用；`editions/<phaseId>/<lessonSlug>.md`：本站校订正文；`editorial.json`：逐课编辑证据；`figures.json`：图解映射；`resource-policy.json`：第三方资源许可与纳入决定。
- `scripts/from-scratch/source.mjs` 与 `import.mjs`：下载/验证快照，不执行源代码；`editorial.mjs`：校订状态；`markdown.mjs` 与 `figures.mjs`：安全转换与本地图解；`build.mjs`：静态页、下载包与 manifest。
- `learn/ai-from-scratch/`：生成产物；`course.css`、`reader.js`、`reader-core.mjs`：主题、离线 UI、搜索/测验/进度；`packs.json`：包注册表；`SOURCE.md`、`LICENSE.txt`、`THIRD-PARTY.md`：出处与许可。
- 修改 `learn/app.js`、`courses.json`、`index.html`、`styles.css`、`sw.js`、`offline-core.mjs`：接入及分包缓存；前三课程的元数据/内容不改。
- 新测试 `tests/from-scratch-{source,editorial,render,reader,packs}.test.mjs`，公共临时目录夹具 `tests/fixtures/from-scratch.mjs`；浏览器/全量链接检查 `scripts/verify-from-scratch.mjs`。

共用记录：`Lesson = { id, phaseId, slug, titleEn, titleZh, englishPath, draftPath, codePaths, outputPaths, quizPath|null, sourceHash }`；`id = phaseId + '/' + slug`。`Project = { id, titleEn, titleZh, readmePath, stageDocPaths, starterPaths, solutionPaths, graderPaths }`。所有路径是无 `..` 的 POSIX 相对路径。输出课页 `/learn/ai-from-scratch/phases/<phaseId>/<slug>/index.html`，项目页 `/learn/ai-from-scratch/projects/<projectId>/index.html`。

## Task 1: 固定快照、清单与来源验证

**Files:** 创建 source-lock、inventory、catalog、resource-policy 初始纳入清单、`scripts/from-scratch/{source,import}.mjs`、源材料与 source 测试/夹具；暂不写站点产物。

**Interfaces:** `importSources({ sourceLock, destination, fetchImpl }) -> Promise<Inventory>`；`verifyInventory({ root, inventory }) -> Promise<void>`；`buildCatalog({ sourceRoot, translationRoot, expectedCounts }) -> Promise<Catalog>`。Inventory 项为 `{ path, revision, bytes, sha256 }`；Catalog 为 `{ phases, lessons, projects, quizzes }`。CLI 只使用锁文件计数；夹具可显式提供其自身的预期计数，无隐藏测试分支。

- [ ] 写 source 失败测试：`assert.equal(catalog.lessons.length, 2)`、`assert.equal(catalog.quizzes.length, 1)` 验证小夹具；改动夹具一字节后 `assert.rejects(verifyInventory(...), /hash/)`；`../escape`、绝对路径、符号链接、缺少课文及重复课 ID 均拒绝。夹具代码包含一个可观察副作用字符串，导入后 `assert.equal(existsSync(sideEffectPath), false)`，证明未执行它。
- [ ] 运行 `node --test tests/from-scratch-source.test.mjs`，确认因缺少上述实现而失败，不因夹具拼写出错失败。
- [ ] 实现 source 接口与 importer CLI；只下载主课程/项目及实际引用的公开资源，形成不可变快照。项目评分器所需的仓库公共脚本（例如 `scripts/project_test.py`）及其静态依赖一并纳入清单，缺少依赖应列为 blocker；不执行这些文件。外部许可未明确的文件进入 policy 的外链记录，不随意抓取网站内容。
- [ ] 运行 `node scripts/from-scratch/import.mjs` 与 source 测试，检查实际产出 `phases=20, lessons=528, quizzes=378, projects=77`；记录包体大小，重新导入不可变文件不能悄悄覆盖不同哈希。
- [ ] 运行 `npm test`，精确暂存本任务文件，提交 `feat: import pinned AI from scratch curriculum sources`。

## Task 2: 逐课中文校订、项目简介与边界记录

**Files:** 创建 editions、editorial、figures 清单、`scripts/from-scratch/editorial.mjs` 和 editorial 测试；补充 resource-policy 的许可审查证据；catalog 的中文标题与项目简介来自此层，不覆盖 upstream。

**Interfaces:** `validateEditorial({ catalog, records, readText }) -> Promise<EditorialReport>`；记录 `{ lessonId, status:'draft'|'reviewed', englishSha256, chineseSha256, reviewedAt, checks, notes, runConditions, executionEvidence|null }`。Report 为 `{ total, reviewed, draft, staleIds, blockers }`。`checks` 必含 `meaning, terminology, math, codeReferences, exercises, limitations`，逐项为 true 才能标 reviewed。运行条件取 `stdlib|dependencies|model-data|network`，可多选；无执行证据不标已运行。

- [ ] 写失败测试：仅有中文文件时 `assert.equal(report.reviewed, 0)`；完整校订记录计为 1；更改英文 hash 后 `assert.deepEqual(report.staleIds, [lessonId])` 且 reviewed 回到 0；缺一项校订检查、重复记录或未知课 ID 拒绝。
- [ ] 运行 `node --test tests/from-scratch-editorial.test.mjs`，确认红灯；实现状态验证接口与 CLI `node scripts/from-scratch/editorial.mjs --check`。
- [ ] 按原课序逐阶段阅读英文全文与草稿，独立校订中文全文、标题与摘要；复核公式、例子、命令和练习，单列本站纠正/补充。对 77 个项目写中文简介/目标，并明确 starter、solution、运行条件与未验证状态。
- [ ] 每阶段二次核读本阶段的中文并对照英文，记录具体校订注释与正文哈希。未读完或语义不确定的课保持 draft，不能批量勾选 reviewed；合法第三方素材在 resource-policy 中附出处/许可，其余保留外链。
- [ ] 每完成一阶段运行 editorial 检查与 `npm test`，精确提交该阶段，提交名 `content: review Chinese phase NN of AI from scratch`。重复本步直至 20 阶段全部完成；最终要求 `total=528, reviewed=528, staleIds=[], blockers=[]`。

## Task 3: 双语安全阅读器、公式/图解、测验与下载

**Files:** 创建 `scripts/from-scratch/{markdown,figures,build}.mjs`、阅读器/主题、render 与 reader 测试；package.json/package-lock 锁定必要依赖；生成本专辑静态页与 download 文件。

**Interfaces:** `renderLessonMarkdown({ markdown, lessonId, resolveLink, figures }) -> { html, referencedAssets, unresolved }`；`buildCourse({ catalog, inventory, editorial, sourceRoot, editionRoot, outputRoot }) -> Promise<BuildReport>`；`gradeQuiz({ questions, answers }) -> { correct, total, feedback }`；`readProgress(raw, validIds) -> Set<string>`；`filterLessons({ lessons, query }) -> Lesson[]`。BuildReport 含 `lessonPages, projectPages, quizCount, unresolved, bytes`。

- [ ] 写失败测试：恶意 `<script>`、`javascript:`、源 HTML 事件属性不进入可执行 HTML；代码 `<>&` 展示原字符；本地链接重写到对应课页；范围外链接明确显示联网提示；缺图/未知 `figure` ID 必须阻止完整构建。合法公式与 Mermaid 输出非空，图必须有替代说明；`gradeQuiz` 对正确/错误/未答分别计分，选项顺序不变；无原测验不生成虚假题目。
- [ ] 运行 `node --test tests/from-scratch-render.test.mjs tests/from-scratch-reader.test.mjs`，确认失败原因后实现上述接口。Markdown 默认不运行源 HTML；必要教学 HTML 转为受控等价结构；图像/SVG 引入需验证资源许可与安全。
- [ ] 将所有 `figure` ID 登记至 figures.json，逐项制作/核对本地静态或交互等价图并说明差别。Mermaid 以 strict、安全配置和关闭 HTML label 的本地工具生成 SVG；公式由本地 KaTeX 渲染及字体展示。无未处理块才允许最终构建。
- [ ] 写搜索/进度失败测试：中文、英文、空白 query、核心术语均可检索；损坏 JSON、错误类型、重复/未知 ID 不破坏进度；实现并运行全部 reader 测试。
- [ ] 实现首页、20 阶段页、528 双语课页、77 项目页及必要项目阶段页，提供上下课与三项公共导航；来源/状态显示真实。代码按文件下载并提供用 fflate 生成的 ZIP，明确 README 中的工作目录、依赖与 starter/solution 区别；不执行代码。quiz 原文完整保留，中文题干/解析若提供须按 Task 2 相同标准校订并独立标状态。
- [ ] 运行 `node scripts/from-scratch/build.mjs --require-reviewed`、本任务测试与 `npm test`；预期 528/77/378，unresolved 为空。精确暂存并提交 `feat: build bilingual AI from scratch offline reader`。

## Task 4: 阶段/项目包、按需缓存与更新回退

**Files:** 创建 packs.json 与各包 manifest；修改 `build.mjs`、`reader.js`、`learn/offline-core.mjs`、`learn/sw.js`；创建 packs 测试。

**Interfaces:** `buildPackRegistry({ catalog, outputRoot, sourceCommit }) -> Promise<{ packs, routes }>`；Pack 为 `{ id, kind:'shared'|'phase'|'project', manifestUrl, dependencies, bytes, assetsCount }`。共享 ID `ai-from-scratch`，阶段 ID `ai-from-scratch-phase-<phaseId>`，项目 ID `ai-from-scratch-project-<projectId>`。复用 `cacheCourse(...)` 的调用/返回与消息格式；新增 `matchSavedPackAsset({ cachesApi, packId, requestUrl, runtimeCacheName }) -> Promise<Response|undefined>`、`getSavedPacks({ cachesApi, packs, origin }) -> Promise<Set<string>>`。

- [ ] 写失败测试：每个 pack 的资源均同源且位于本课程，阶段包不含别阶段课文/ZIP；共享资源归共享包，阶段/项目均声明共享依赖；bytes 等于实际文件字节和；manifest 的 content hash 随正文变动。
- [ ] 写失败测试：正在写入的新 cache 不命中；完整旧版优于 stale runtime；模拟中途 fetch 失败后旧版和其他阶段仍在；缓存被浏览器清空后 `getSavedPacks` 不返回 localStorage 的旧状态；直达课页保存先完成共享包，再完成本阶段。
- [ ] 运行 `node --test tests/from-scratch-packs.test.mjs tests/offline-core.test.mjs`，确认红灯；实现包注册/生成、只在完成后写入的缓存完整性标记与 scoped lookup。完整性标记仅用于新专辑，不改变旧课程读取语义。保存/删除以精确 pack ID 和版本为边界。
- [ ] 接入按阶段/项目保存、重试、预计大小与状态；用户点击「保存全部阅读内容」才按共享、20 阶段、77 项目顺序保存阅读包，并显示总大小。下载 ZIP 与模型/数据不在 bulk 阅读包中，ZIP 另有明确的下载/离线保存操作。
- [ ] 运行上述测试、`npm test`、构建；精确暂存本任务文件，提交 `feat: add on-demand curriculum offline packs`。

## Task 5: 课程库入口与旧用户升级

**Files:** 修改 `learn/{courses.json,app.js,index.html,styles.css,sw.js}`；更新元数据/站点契约测试；浏览器脚本增加升级场景。

**Interfaces:** 新课程元数据遵循现有字段，并增加 `phaseCount:20, chapterCount:528, projectCount:77, autoCache:false`；`offlineManifest` 指向共享包。现有三门未设 autoCache，原自动保存行为保持；库中新课程未保存时提示「进入课程，按阶段保存」。

- [ ] 写失败测试：课程目录为四门，前三对象深比较未变；新卡为淡绿、阶段阶梯、新路由和正确数字；全部新页面有 AI 学习/图解笔记链接；禁 JS 时目录仍有直接入口。
- [ ] 写浏览器失败场景：打开库请求中不含新专辑阶段 manifest 或大包；旧 shell 与已保存三课程升级后仍可断网访问，原 localStorage 不被清理。
- [ ] 运行 `npm test` 和升级场景，确认缺失新入口/autoCache 处理而失败；实现新入口与条件缓存，注册继续使用 `updateViaCache:'none'`，提升 shell version，并检查实际激活的新 worker。
- [ ] 运行 `npm test` 与本场景；记录库截图和实际网络请求证据。精确提交 `feat: add AI from scratch album to learning library`。

## Task 6: 全量核验、独立审查与安全发布

**Files:** 完成 `scripts/verify-from-scratch.mjs`、SOURCE/LICENSE/THIRD-PARTY/内容报告；如检查发现产品问题，以相应任务的失败回归测试修复。

**Interfaces:** `node scripts/verify-from-scratch.mjs --base <url> --all` 输出 JSON `{ lessonPages, projectPages, quizCount, reviewed, brokenLinks, externalContentRequests, offlineFailures, pageErrors, widths }`；非零缺陷退出失败。public 验证的 base 为 `https://serebiisme.github.io`，本地由只读静态服务器提供整个仓库。

- [ ] 补全覆盖检查：断言 528 课路径、77 项目、378 原测验一一对应；所有同源链接、公式资产、图解和可下载文件存在；SOURCE 记录两个 SHA，英文镜像哈希不变；reviewed=528。原英文/项目外链明确需要联网，不要求断网打开外部原站。
- [ ] 启动本地预览并执行全量浏览器检查；先记录新课程尚未保存时的提示，再保存所有阅读包，设置浏览器 offline，逐页访问全部 528 课和 77 项目/阶段页，检查双语切换、测验、进度刷新和保存的下载。运行时内容外部请求为 0，页面错误为 0。
- [ ] 在 320/390/768/1440 宽度检查首页、阶段、长公式、代码块、双语课页及项目页；代码块自身可滚动但页面无横向溢出；键盘可操作语言切换、测验与保存按钮。复测旧三课程断网与升级。
- [ ] 按用户选择的执行方法调用独立审查：Native 在全任务结束后一次 whole-branch review；Subagent-driven 按其技能执行逐任务 review，并在末尾审查整个分支。审查源码、中文样本/校订证据、资源授权及全量测试结果；修复后重跑相关与全套测试。
- [ ] 运行 `npm test`、`git diff --check`；对精确暂存的发布树运行 publish-github-pages 的 `preflight-static-site.sh`。安全检查不能因出现源代码示例而直接忽略；逐项确认无真实密钥/内部数据、未授权素材、遗漏资源或超大模型文件。
- [ ] 精确提交正常推送到确认的 master，记录 SHA；用 `verify-pages.sh Serebiisme/Serebiisme.github.io <SHA>` 核对预期提交 built、公开地址成功，再对公共地址运行全量 browser 检查。仅全部通过才报告已发布，并附真实中文校订数量、离线覆盖和运行未验证边界。

## 审阅与执行方法

本计划仅在用户审阅后开始执行。建议 Native：导入、渲染和缓存接口依赖紧密，在本会话顺序实现可减少重复上下文与交接成本；最终安排一次独立整体验证。Subagent-driven 可以把逐阶段内容任务交给独立工作者，并逐任务审查，但上下文与审查开销更高。未选定方法前不创建子代理、不安装依赖、不开始产品代码。

计划自检：规范每节由 Tasks 1–6 覆盖；五项 Review Focus 均有对应失败测试；记录和接口名称一致；章节/项目/测验计数与来源锁一致；中文逐课校订、图解逐项处理与完整断网检查均是最终发布门槛，不能被中间预览代替。
