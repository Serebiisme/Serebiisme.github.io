# AI 学习离线课程库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Serebii Labs 增加“AI 学习”课程专辑库，并把《深入理解 AI Agent：设计原理与工程实践》中文版完整镜像为首次加载后可断网阅读的第一门课程。

**Architecture:** 保持 GitHub Pages 从 `master` 根目录发布。根站只增加入口；`/learn/` 是手写的课程库与 PWA 外壳；`/learn/ai-agent-book/` 是从固定上游提交构建的中文 Astro 静态产物。课程元数据、离线资源清单和 Service Worker 通过稳定接口连接，上游内容与 Serebii Labs 手写代码彼此隔离。

**Tech Stack:** 静态 HTML/CSS、原生 JavaScript、Service Worker、Web App Manifest、Node.js 22 内置测试框架、Astro 7（仅用于上游书籍构建）、GitHub Pages legacy branch deployment。

**Spec:** `docs/superpowers/specs/2026-09-17-ai-learning-offline-course-design.md`

## Global Constraints

- 公开标题固定为“AI 学习”。
- 首门课程固定来自 `https://github.com/bojieli/ai-agent-book.git` 的提交 `c8963443736004412692b1af7706c89096d46e4e`。
- 原正文不得改写；仅可增加中文路由、离线元数据、来源说明和 Serebii Labs 课程入口。
- 课程必须包含引言、10 章正文、后记和思考题参考答案。
- 所有阅读必需的字体、脚本、样式和图片必须位于 `serebiisme.github.io/learn/` 同源路径。
- 完整课程缓存成功前不得显示“已可离线阅读”。
- Service Worker 作用域必须限定为 `/learn/`。
- 必须保留 Bojie Li 署名、原仓库链接、Apache License 2.0 全文、固定上游提交和派生修改说明。
- Pages 发布来源保持 `master:/`，不得切换到新的 Pages 来源或强推。

---

## File Map

- `package.json`：本站无依赖测试和同步命令入口。
- `index.html`：根站“AI 学习”导航、课程卡和已发布统计。
- `learn/index.html`：课程专辑库语义骨架、PWA 元数据和错误/空状态容器。
- `learn/styles.css`：课程库响应式视觉样式。
- `learn/app.js`：读取课程清单、渲染真实课程、注册 Service Worker、呈现离线进度。
- `learn/offline-core.mjs`：页面和 Service Worker 共享的纯函数与消息常量。
- `learn/sw.js`：课程库外壳缓存、课程完整缓存、进度消息和离线回退。
- `learn/courses.json`：课程目录和固定上游版本。
- `learn/manifest.webmanifest`、`learn/icon.svg`：可安装 PWA 元数据和图标。
- `learn/offline.html`：课程尚未缓存时的同源离线提示。
- `learn/ai-agent-book/`：生成的中文课程静态产物、许可证、来源说明和离线清单。
- `overlays/ai-agent-book/editions.json`：把上游 Astro 构建限制为简体中文版。
- `overlays/ai-agent-book/src/components/SupplementalReader.astro`：引言、后记和参考答案的阅读外壳。
- `overlays/ai-agent-book/src/pages/[supplement].astro`：三条补充中文路由。
- `scripts/generate-offline-manifest.mjs`：确定性枚举课程资源并生成内容版本。
- `scripts/import-ai-agent-book.mjs`：安全地校验并替换课程生成目录。
- `scripts/sync-ai-agent-book.sh`：固定提交抓取、上游测试、叠加中文补充路由、构建与导入。
- `tests/course-metadata.test.mjs`：课程清单契约。
- `tests/site-contract.test.mjs`：根站、课程库、生成页面、授权和同源资源契约。
- `tests/offline-core.test.mjs`：离线作用域、缓存名、清单与更新逻辑的纯函数测试。
- `tests/offline-manifest.test.mjs`：资源清单的排序、完整性和确定性测试。

---

### Task 1: Establish the course metadata contract

**Files:**
- Create: `package.json`
- Create: `tests/course-metadata.test.mjs`
- Create: `learn/courses.json`

**Interfaces:**
- Produces: `learn/courses.json` as an array of course records with `id`, `title`, `author`, `route`, `sourceRepository`, `sourceCommit`, `license`, `chapterCount`, and `offlineManifest`.
- Produces: `npm test` as the single local verification entry point.

- [ ] **Step 1: Write the failing metadata test**

```js
// tests/course-metadata.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const courses = JSON.parse(await readFile(new URL('../learn/courses.json', import.meta.url)));

test('publishes exactly the real first course', () => {
  assert.equal(courses.length, 1);
  assert.deepEqual(courses[0], {
    id: 'ai-agent-book',
    title: '深入理解 AI Agent：设计原理与工程实践',
    author: 'Bojie Li',
    route: '/learn/ai-agent-book/',
    sourceRepository: 'https://github.com/bojieli/ai-agent-book',
    sourceCommit: 'c8963443736004412692b1af7706c89096d46e4e',
    license: 'Apache-2.0',
    chapterCount: 10,
    offlineManifest: '/learn/ai-agent-book/offline-manifest.json'
  });
});
```

- [ ] **Step 2: Run the test and verify the fixture is absent**

Run: `node --test tests/course-metadata.test.mjs`

Expected: FAIL with `ENOENT` for `learn/courses.json`.

- [ ] **Step 3: Add the test runner and exact course record**

```json
{
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "sync:ai-agent-book": "bash scripts/sync-ai-agent-book.sh"
  }
}
```

Create `learn/courses.json` with the exact object asserted above.

- [ ] **Step 4: Run the metadata test**

Run: `node --test --test-name-pattern='publishes exactly the real first course' tests/course-metadata.test.mjs`

Expected: PASS, 1 matching test and 0 failures.

- [ ] **Step 5: Commit the metadata contract**

```bash
git add package.json tests/course-metadata.test.mjs learn/courses.json
git commit -m "test: define AI learning course metadata"
```

---

### Task 2: Build the Serebii Labs entry and course library shell

**Files:**
- Modify: `index.html`
- Create: `learn/index.html`
- Create: `learn/styles.css`
- Create: `learn/app.js`
- Create: `learn/manifest.webmanifest`
- Create: `learn/icon.svg`
- Create: `learn/offline.html`
- Create: `tests/site-contract.test.mjs`

**Interfaces:**
- Consumes: `learn/courses.json` from Task 1.
- Produces: an accessible `.course-grid` populated only from the course manifest.
- Produces: DOM hooks `#course-grid`, `#library-status`, `<template id="course-card-template">`, and per-course `[data-offline-status]` for Task 4.

- [ ] **Step 1: Write failing homepage and library tests**

```js
// tests/site-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('root page exposes AI 学习 in navigation and the first card', async () => {
  const html = await read('index.html');
  assert.match(html, /<a href="\/learn\/">AI 学习<\/a>/);
  assert.match(html, /<a class="card card-large" href="\/learn\/">/);
  assert.match(html, /<strong>01<\/strong>/);
});

test('course library has accessible PWA and rendering hooks', async () => {
  const html = await read('learn/index.html');
  assert.match(html, /<title>AI 学习 · Serebii Labs<\/title>/);
  assert.match(html, /rel="manifest" href="\/learn\/manifest\.webmanifest"/);
  assert.match(html, /id="course-grid"/);
  assert.match(html, /id="course-card-template"/);
  assert.match(html, /src="\/learn\/app\.js"/);
  assert.match(html, /课程版权归原作者/);
});
```

- [ ] **Step 2: Run the site contract tests and verify they fail**

Run: `node --test tests/site-contract.test.mjs`

Expected: FAIL because the homepage has no `/learn/` link and `learn/index.html` does not exist.

- [ ] **Step 3: Update the root homepage**

Apply these exact content changes in `index.html`:

- Add `<a href="/learn/">AI 学习</a>` before the existing GitHub link.
- Change `<strong>00</strong>` to `<strong>01</strong>` and the adjacent copy to `个可体验入口`.
- Replace the first disabled `<article>` with `<a class="card card-large" href="/learn/">`.
- Use tag `01 / 已发布`, category `Offline Course`, heading `AI 学习`, and description `把值得反复阅读的中文 AI 课程完整收藏下来，联网一次，随后可离线阅读。`.

- [ ] **Step 4: Add the course library document and visual system**

Create semantic markup with a visible `AI 学习` heading, loading/error status, an empty `#course-grid`, and this template interface:

```html
<template id="course-card-template">
  <article class="course-card">
    <div class="course-meta"><span data-course-number></span><span data-course-chapters></span></div>
    <h2 data-course-title></h2>
    <p data-course-author></p>
    <p data-course-source></p>
    <div class="course-actions">
      <a data-course-link>进入课程</a>
      <a data-course-license>授权与来源</a>
    </div>
    <p class="offline-status" data-offline-status aria-live="polite">正在检测离线状态…</p>
  </article>
</template>
```

Use the existing root colors `#191919`, `#f4f1ea`, `#d9ff53`, and `#ff785d`; keep the course grid one column below `720px` and ensure focus rings remain visible.

- [ ] **Step 5: Add initial manifest, icon, offline page, and data rendering**

`learn/manifest.webmanifest` must use `name: "AI 学习"`, `start_url: "/learn/"`, `scope: "/learn/"`, `display: "standalone"`, theme `#f4f1ea`, and `/learn/icon.svg` with `sizes: "any"`.

`learn/app.js` must fetch `/learn/courses.json`, clone one template per returned record, set links using record fields, and replace `#library-status` with an actionable error containing the original repository URL when loading fails. It must not contain hard-coded fake course cards.

- [ ] **Step 6: Run the metadata and shell tests**

Run: `npm test`

Expected: PASS with all Task 1–2 tests and 0 failures.

- [ ] **Step 7: Commit the entry and shell**

```bash
git add index.html learn/index.html learn/styles.css learn/app.js learn/courses.json learn/manifest.webmanifest learn/icon.svg learn/offline.html tests/site-contract.test.mjs
git commit -m "feat: add AI learning course library"
```

---

### Task 3: Generate deterministic full-course offline manifests

**Files:**
- Create: `scripts/generate-offline-manifest.mjs`
- Create: `tests/offline-manifest.test.mjs`

**Interfaces:**
- Produces: `collectAssets(rootDir, publicPrefix)` returning sorted URL paths for all regular files except `offline-manifest.json`.
- Produces: `buildManifest(rootDir, publicPrefix, sourceCommit)` returning `{ version, sourceCommit, assets }`, where `version` is the first 16 hex characters of a SHA-256 digest over each URL and file content.
- CLI: `node scripts/generate-offline-manifest.mjs ROOT PUBLIC_PREFIX SOURCE_COMMIT OUTPUT`.

- [ ] **Step 1: Write failing determinism tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectAssets, buildManifest } from '../scripts/generate-offline-manifest.mjs';

test('manifest is complete, sorted, self-excluding, and deterministic', async () => {
  const root = await mkdtemp(join(tmpdir(), 'course-manifest-'));
  await mkdir(join(root, 'book', 'chapter1'), { recursive: true });
  await writeFile(join(root, 'index.html'), 'home');
  await writeFile(join(root, 'book', 'chapter1', 'index.html'), 'chapter');
  await writeFile(join(root, 'offline-manifest.json'), 'old');
  assert.deepEqual(await collectAssets(root, '/learn/ai-agent-book/'), [
    '/learn/ai-agent-book/book/chapter1/index.html',
    '/learn/ai-agent-book/index.html'
  ]);
  const first = await buildManifest(root, '/learn/ai-agent-book/', 'abc');
  const second = await buildManifest(root, '/learn/ai-agent-book/', 'abc');
  assert.deepEqual(first, second);
  assert.match(first.version, /^[a-f0-9]{16}$/);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --test tests/offline-manifest.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/generate-offline-manifest.mjs`.

- [ ] **Step 3: Implement the generator using Node built-ins**

Use `readdir({ withFileTypes: true })`, recursive lexical sorting, `createHash('sha256')`, and `readFile`. Reject a `publicPrefix` that does not begin and end with `/`. The CLI writes pretty JSON followed by one newline.

- [ ] **Step 4: Verify determinism and the full suite**

Run: `npm test`

Expected: PASS, including identical manifests from identical fixtures.

- [ ] **Step 5: Commit the manifest generator**

```bash
git add scripts/generate-offline-manifest.mjs tests/offline-manifest.test.mjs
git commit -m "feat: generate deterministic offline manifests"
```

---

### Task 4: Implement reliable course caching and progress reporting

**Files:**
- Create: `learn/offline-core.mjs`
- Create: `learn/sw.js`
- Modify: `learn/app.js`
- Create: `tests/offline-core.test.mjs`
- Modify: `tests/site-contract.test.mjs`

**Interfaces:**
- Produces: `isLearnUrl(url, origin)` which is true only for same-origin `/learn/` requests.
- Produces: `shellCacheName(version)` and `courseCacheName(courseId, version)`.
- Message input: `{ type: 'CACHE_COURSE', courseId, manifestUrl }`.
- Message output: `{ type: 'CACHE_PROGRESS', courseId, completed, total }`, `{ type: 'CACHE_READY', courseId, version, total }`, or `{ type: 'CACHE_ERROR', courseId, message }`.

- [ ] **Step 1: Write failing pure-function and source-contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isLearnUrl, courseCacheName } from '../learn/offline-core.mjs';

test('service worker scope helper rejects other origins and root pages', () => {
  assert.equal(isLearnUrl('https://serebiisme.github.io/learn/', 'https://serebiisme.github.io'), true);
  assert.equal(isLearnUrl('https://serebiisme.github.io/', 'https://serebiisme.github.io'), false);
  assert.equal(isLearnUrl('https://example.com/learn/', 'https://serebiisme.github.io'), false);
});

test('course cache names are versioned and isolated', () => {
  assert.equal(courseCacheName('ai-agent-book', 'a1b2'), 'ai-learning-course:ai-agent-book:a1b2');
});
```

Extend `tests/site-contract.test.mjs` to assert that `app.js` registers `/learn/sw.js` with scope `/learn/` and type `module`, and that `sw.js` contains all three output message types.

- [ ] **Step 2: Run the offline tests and verify they fail**

Run: `node --test tests/offline-core.test.mjs tests/site-contract.test.mjs`

Expected: FAIL because `offline-core.mjs` and `sw.js` do not exist and registration is absent.

- [ ] **Step 3: Implement shared helpers and the shell cache**

`offline-core.mjs` exports message constants, validates same-origin `/learn/` URLs, and generates names prefixed with `ai-learning-shell:` or `ai-learning-course:`. `sw.js` installs a versioned shell cache containing exactly `/learn/`, `/learn/index.html`, `/learn/styles.css`, `/learn/app.js`, `/learn/offline-core.mjs`, `/learn/courses.json`, `/learn/manifest.webmanifest`, `/learn/icon.svg`, and `/learn/offline.html`.

- [ ] **Step 4: Implement transactional course caching**

On `CACHE_COURSE`, fetch and validate the manifest, open the new version cache, fetch each same-origin asset with `{ cache: 'reload' }`, require `response.ok`, cache the response, and send progress after each asset. If any asset fails, delete only the incomplete new cache and send `CACHE_ERROR`. After all assets succeed, send `CACHE_READY`, then delete older cache names for the same course. Never delete the prior complete cache before the new cache is ready.

- [ ] **Step 5: Implement fetch routing**

- Ignore cross-origin and non-`/learn/` requests.
- Use network-first with shell-cache fallback for `/learn/` and `/learn/index.html`.
- Use cache-first with network population for course files.
- For failed document requests without a cached response, return cached `/learn/offline.html`.

- [ ] **Step 6: Connect UI registration and status messages**

Register with:

```js
await navigator.serviceWorker.register('/learn/sw.js', {
  scope: '/learn/',
  type: 'module'
});
```

After `navigator.serviceWorker.ready`, post one `CACHE_COURSE` message for each real course. Render exact states:

- `正在准备离线内容（${completed}/${total}）`
- `已可离线阅读`
- `离线准备失败，可重试`
- `当前浏览器不支持离线缓存，可继续在线阅读`

The failure state includes a retry button that repeats the same message for that course.

- [ ] **Step 7: Run all tests**

Run: `npm test`

Expected: PASS with scope, cache naming, message protocol, and site-contract coverage.

- [ ] **Step 8: Commit the offline engine**

```bash
git add learn/app.js learn/offline-core.mjs learn/sw.js tests/offline-core.test.mjs tests/site-contract.test.mjs
git commit -m "feat: cache AI courses for offline reading"
```

---

### Task 5: Add the reproducible Chinese-only upstream build overlay

**Files:**
- Create: `overlays/ai-agent-book/editions.json`
- Create: `overlays/ai-agent-book/src/components/SupplementalReader.astro`
- Create: `overlays/ai-agent-book/src/pages/[supplement].astro`
- Create: `scripts/import-ai-agent-book.mjs`
- Create: `scripts/sync-ai-agent-book.sh`
- Create: `tests/upstream-overlay.test.mjs`

**Interfaces:**
- Consumes: the fixed upstream commit and Node.js `>=22.12.0`.
- Produces: a Chinese-only Astro `dist/` containing `/`, `/book/chapter1/` through `/book/chapter10/`, `/introduction/`, `/afterword/`, and `/reference-answers/`.
- Produces: `SOURCE.md` and `LICENSE.txt` beside the generated course.

- [ ] **Step 1: Write failing overlay tests**

The test loads `overlays/ai-agent-book/editions.json` and asserts it has only `zh-CN`. It reads `[supplement].astro` and asserts exact static slugs `introduction`, `afterword`, and `reference-answers`, plus source paths under `book/`. It reads the sync script and asserts the fixed SHA, `ASTRO_BASE=/learn/ai-agent-book/`, `npm test`, `npm run check`, `npm run build`, and `npm run check:deployment` are present.

- [ ] **Step 2: Run the overlay test and verify it fails**

Run: `node --test tests/upstream-overlay.test.mjs`

Expected: FAIL because overlay and sync files do not exist.

- [ ] **Step 3: Create the Chinese-only edition overlay**

Use the upstream `zh-CN` record unchanged:

```json
{
  "zh-CN": {
    "name": "简体中文",
    "home": "/",
    "chapter": "/book/chapter1/",
    "directory": "book",
    "suffix": "",
    "pdf": "zh-CN",
    "dir": "ltr"
  }
}
```

- [ ] **Step 4: Add the supplemental route without editing prose**

`[supplement].astro` imports the three Markdown sources with `import.meta.glob`, returns three static paths, and passes the selected Markdown instance to `SupplementalReader`. The component reuses upstream `Layout`, `Header`, `reader.css`, and the Markdown `<Content />`; it provides links back to the book home, all 10 chapters, and the other supplemental pages. It labels the page as a Serebii Labs offline mirror and links to `/learn/` and `SOURCE.md`.

- [ ] **Step 5: Implement atomic import validation**

`import-ai-agent-book.mjs` accepts `DIST TARGET LICENSE SOURCE_COMMIT`. Before moving data, require these files in `DIST`: `index.html`, `book/chapter1/index.html` through `book/chapter10/index.html`, `introduction/index.html`, `afterword/index.html`, and `reference-answers/index.html`. It copies into a sibling staging directory, writes `LICENSE.txt` and `SOURCE.md`, generates the offline manifest, then swaps the staging directory into `TARGET`. If validation fails, the existing target remains untouched.

- [ ] **Step 6: Implement the pinned sync script**

The script uses `set -euo pipefail`, a `mktemp -d` checkout, and the exact SHA. It runs upstream tests and checks before copying the edition overlay and supplemental route into the temporary clone. It then runs:

```bash
ASTRO_BASE=/learn/ai-agent-book/ npm run build
ASTRO_BASE=/learn/ai-agent-book/ npm run check:deployment
node "$site_root/scripts/import-ai-agent-book.mjs" \
  "$checkout/web-astro/dist" \
  "$site_root/learn/ai-agent-book" \
  "$checkout/LICENSE" \
  "c8963443736004412692b1af7706c89096d46e4e"
```

Ensure temporary cleanup targets only the directory returned by `mktemp`; never clean the repository root.

- [ ] **Step 7: Run the overlay tests**

Run: `npm test`

Expected: PASS with fixed SHA, Chinese-only edition, supplemental routes, and guarded import coverage.

- [ ] **Step 8: Commit the reproducible build tooling**

```bash
git add overlays/ai-agent-book scripts/import-ai-agent-book.mjs scripts/sync-ai-agent-book.sh tests/upstream-overlay.test.mjs
git commit -m "build: add pinned AI agent book importer"
```

---

### Task 6: Build and import the complete first course

**Files:**
- Create: `learn/ai-agent-book/**` generated static output
- Modify: `learn/courses.json` only if the generated manifest path or pinned version differs from its established contract; otherwise leave unchanged.
- Modify: `tests/site-contract.test.mjs`

**Interfaces:**
- Consumes: the build and import commands from Task 5.
- Produces: a complete same-origin course and `learn/ai-agent-book/offline-manifest.json`.

- [ ] **Step 1: Extend the site contract before importing**

Add assertions for all required HTML pages, `LICENSE.txt`, `SOURCE.md`, and `offline-manifest.json`. Parse the offline manifest and require every regular file under `learn/ai-agent-book/` except the manifest itself to appear exactly once. Scan generated HTML/CSS tags and `url(...)` values; fail if a runtime asset uses `bojieli.github.io`, `unpkg.com`, `cdn.*`, or a path outside `/learn/ai-agent-book/`.

- [ ] **Step 2: Run the full suite and verify the course-output assertions fail**

Run: `npm test`

Expected: FAIL with missing `learn/ai-agent-book/index.html`.

- [ ] **Step 3: Run the pinned upstream synchronization**

Run: `npm run sync:ai-agent-book`

Expected: upstream `npm test`, `astro check`, Astro build, deployment check, import validation, and manifest generation all exit 0.

- [ ] **Step 4: Inspect generated scope and size**

Run:

```bash
find learn/ai-agent-book -type f | wc -l
du -sh learn/ai-agent-book
find learn/ai-agent-book -type f -size +20M -print
```

Expected: file count is greater than 20, total remains below the GitHub Pages 1 GB site limit, and no unexpected file exceeds 20 MB.

- [ ] **Step 5: Run all site tests against generated output**

Run: `npm test`

Expected: PASS with all required pages, complete manifest coverage, same-origin runtime assets, provenance, and license checks.

- [ ] **Step 6: Review generated attribution**

Run:

```bash
sed -n '1,200p' learn/ai-agent-book/SOURCE.md
sed -n '1,30p' learn/ai-agent-book/LICENSE.txt
git diff --stat
```

Expected: source repository, fixed SHA, build date, Chinese-only edition overlay, supplemental-page overlay, and Apache 2.0 text are present.

- [ ] **Step 7: Commit the imported course**

```bash
git add learn/ai-agent-book tests/site-contract.test.mjs
git commit -m "feat: import AI Agents in Depth for offline reading"
```

---

### Task 7: Verify online behavior, full cache completion, and real offline reloads

**Files:**
- Modify only if verification exposes a defect: the smallest responsible file under `learn/`, `scripts/`, `overlays/`, or `tests/`.

**Interfaces:**
- Produces: browser evidence for cache completion and offline reload behavior.

- [ ] **Step 1: Run a local same-origin server**

Run: `python3 -m http.server 4173 --bind 127.0.0.1`

Expected: a persistent local server serving the repository root.

- [ ] **Step 2: Verify desktop and mobile online navigation**

Open `http://127.0.0.1:4173/`, follow “AI 学习” to `/learn/`, enter the course, and inspect the homepage, Chapter 1, Chapter 5, Chapter 10, introduction, afterword, and reference answers. Repeat the library and one chapter at a mobile viewport near 390×844. Confirm no horizontal overflow, broken images, console errors, or missing formula/code styles.

- [ ] **Step 3: Wait for authoritative full-cache status**

Keep `/learn/` open until the visible per-course status is exactly `已可离线阅读`. Inspect Cache Storage and verify the active course cache contains the same number of URLs as `offline-manifest.json`.

- [ ] **Step 4: Test real browser offline mode**

Enable browser offline mode after cache completion. Reload `/learn/`, `/learn/ai-agent-book/`, `/learn/ai-agent-book/book/chapter1/`, `/learn/ai-agent-book/book/chapter5/`, `/learn/ai-agent-book/book/chapter10/`, and one supplemental page. Confirm rendered text, a representative image, KaTeX formula styles, code styles, and chapter navigation remain available.

- [ ] **Step 5: Restore online mode and rerun automation**

Run: `npm test`

Expected: PASS, and the browser returns to online navigation without clearing the complete offline cache.

- [ ] **Step 6: Commit only verification-driven fixes**

If fixes were necessary, stage only those files and commit with `fix: complete AI course offline verification`. If no code changed, do not create an empty commit.

---

### Task 8: Publish and verify GitHub Pages

**Files:**
- No new files expected.

**Interfaces:**
- Produces: one public GitHub Pages release at `https://serebiisme.github.io/learn/` tied to a verifiable commit.

- [ ] **Step 1: Run final local gates**

Run:

```bash
npm test
git diff --check
git status --short --branch
```

Expected: all tests pass, no whitespace errors, and only the intended local commits are ahead of `origin/master`.

- [ ] **Step 2: Run the static-site publication preflight on a `.git`-free copy**

Copy the repository contents excluding `.git` into a uniquely named temporary directory, then run:

```bash
/Users/bytedance/.codex/plugins/cache/personal/publish-github-pages/0.1.0/skills/publish-github-pages/scripts/preflight-static-site.sh TEMP_DIR
```

Expected: `OK`, a top-level `index.html`, no suspected credential material, and total size below 1 GB.

- [ ] **Step 3: Push normal commits to the existing source branch**

Run: `git push origin master`

Expected: no force push; remote `master` advances to the final local SHA.

- [ ] **Step 4: Wait for the exact Pages build**

Run:

```bash
expected_sha=$(git rev-parse HEAD)
/Users/bytedance/.codex/plugins/cache/personal/publish-github-pages/0.1.0/skills/publish-github-pages/scripts/verify-pages.sh Serebiisme/Serebiisme.github.io "$expected_sha"
```

Repeat only while the authoritative build state is `queued` or `building`.

Expected: `pages_status=built`, latest build commit equals `expected_sha`, and HTTP status is 2xx/3xx.

- [ ] **Step 5: Verify public course and offline behavior**

On `https://serebiisme.github.io/`, verify the visible root entry, `/learn/`, representative course pages, attribution pages, complete-cache status, and offline reload using the same evidence checks as Task 7.

- [ ] **Step 6: Record release evidence**

Report the public root, course-library URL, first-course URL, final site commit, fixed upstream commit, Pages build status, HTTP status, automated test count, and offline reload results. Do not claim completion if any page, asset, cache, attribution, or Pages check is missing.
