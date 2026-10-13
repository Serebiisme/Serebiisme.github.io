import { MESSAGE, offlineStatusFromMessage } from '/learn/offline-core.mjs';

const questions = [...document.querySelectorAll('[data-question]')];
const search = document.querySelector('#question-search');
search?.addEventListener('input', () => {
  const term = search.value.trim().toLowerCase();
  for (const question of questions) question.hidden = !question.dataset.search.includes(term);
  document.querySelector('#search-count').textContent = `${questions.filter((q) => !q.hidden).length} 道题`;
});
document.querySelector('#expand-all')?.addEventListener('click', (event) => {
  const visible = questions.filter((q) => !q.hidden);
  const expand = visible.some((q) => !q.open);
  for (const question of visible) question.open = expand;
  event.currentTarget.textContent = expand ? '收起全部' : '展开全部';
});
function showHashQuestion() {
  const element = document.getElementById(location.hash.slice(1));
  if (element?.matches('[data-question]')) {
    element.hidden = false;
    element.open = true;
    element.scrollIntoView();
  }
}
showHashQuestion();
addEventListener('hashchange', showHashQuestion);

const storageKey = 'serebii-ai-engineering-mastery:1';
let mastered = {};
try { mastered = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { /* Reading remains available. */ }
if (!mastered || typeof mastered !== 'object' || Array.isArray(mastered)) mastered = {};
const checks = [...document.querySelectorAll('[data-mastered]')];
function updateCount() {
  const count = document.querySelector('#mastered-count');
  if (count) count.textContent = String(checks.filter((c) => c.checked).length);
}
for (const check of checks) {
  check.checked = mastered[check.dataset.mastered] === true;
  check.addEventListener('change', () => {
    mastered[check.dataset.mastered] = check.checked;
    try { localStorage.setItem(storageKey, JSON.stringify(mastered)); } catch {
      document.querySelector('.annotation').textContent = '当前浏览器无法保存掌握状态；本次勾选仍有效。';
    }
    updateCount();
  });
}
updateCount();

const save = document.querySelector('#save-offline');
const status = document.querySelector('#offline-status');
if (!('serviceWorker' in navigator)) {
  save.hidden = true;
  status.textContent = '当前浏览器不支持离线缓存，可继续在线阅读。';
} else {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.courseId !== 'ai-engineering') return;
    const state = offlineStatusFromMessage(event.data);
    if (!state) return;
    status.textContent = state.text;
    save.disabled = state.state === 'progress';
    if (state.state === 'ready') save.textContent = '已保存 · 检查更新';
    if (state.state === 'error') save.textContent = '保存失败 · 重试';
  });
  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = '正在准备离线内容…';
    try {
      await navigator.serviceWorker.register('/learn/sw.js', { scope: '/learn/', type: 'module' });
      const registration = await navigator.serviceWorker.ready;
      registration.active.postMessage({ type: MESSAGE.cacheCourse, courseId: 'ai-engineering', manifestUrl: '/learn/ai-engineering/offline-manifest.json' });
    } catch {
      status.textContent = '离线准备失败，请联网后重试。';
      save.disabled = false;
    }
  });
}
