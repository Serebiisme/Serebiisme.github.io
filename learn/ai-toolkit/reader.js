import { MESSAGE, offlineStatusFromMessage } from '/learn/offline-core.mjs';
import { readProgress } from './reader-core.mjs';

const ids = JSON.parse(document.querySelector('#lesson-ids').textContent);
const storageKey = 'serebii-ai-toolkit-progress:1';
let completed;
try { completed = readProgress(localStorage.getItem(storageKey), ids); } catch { completed = new Set(); }
function renderProgress() {
  for (const counter of document.querySelectorAll('[data-progress-total]')) counter.textContent = String(completed.size);
  for (const counter of document.querySelectorAll('[data-guide-progress]')) {
    const guide = counter.dataset.guideProgress;
    counter.textContent = String([...completed].filter((id) => id.startsWith(`${guide}/`)).length);
  }
}
for (const check of document.querySelectorAll('[data-lesson-check]')) {
  check.checked = completed.has(check.dataset.lessonCheck);
  check.addEventListener('change', () => {
    if (check.checked) completed.add(check.dataset.lessonCheck);
    else completed.delete(check.dataset.lessonCheck);
    const status = document.querySelector('#progress-status');
    try {
      localStorage.setItem(storageKey, JSON.stringify([...completed]));
      status.textContent = check.checked ? '已记录本节完成状态。' : '已取消本节完成状态。';
    } catch { status.textContent = '当前浏览器无法保存进度；本次勾选仍有效。'; }
    renderProgress();
  });
}
renderProgress();

const search = document.querySelector('#guide-search');
search?.addEventListener('input', () => {
  const term = search.value.trim().toLowerCase();
  const cards = [...document.querySelectorAll('[data-guide-card]')];
  for (const card of cards) card.hidden = !card.dataset.search.includes(term);
  const count = cards.filter((card) => !card.hidden).length;
  document.querySelector('#search-count').textContent = `${count} 个分区`;
  document.querySelector('#empty-search').hidden = count !== 0;
  for (const group of document.querySelectorAll('.catalogue-group')) group.hidden = !group.querySelector('[data-guide-card]:not([hidden])');
});

const save = document.querySelector('#save-offline');
const status = document.querySelector('#offline-status');
if (!('serviceWorker' in navigator)) {
  save.hidden = true;
  status.textContent = '当前浏览器不支持离线缓存，仍可在线阅读或下载练习册。';
} else {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.courseId !== 'ai-toolkit') return;
    const visible = offlineStatusFromMessage(event.data);
    if (!visible) return;
    status.textContent = visible.text;
    status.dataset.state = visible.state;
    save.disabled = visible.state === 'progress';
    if (visible.state === 'ready') save.textContent = '已保存 · 检查更新';
    if (visible.state === 'error') save.textContent = '保存失败 · 重试';
  });
  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = '正在准备离线内容…';
    try {
      const installed = await navigator.serviceWorker.getRegistration('/learn/');
      if (navigator.onLine || !installed?.active) await navigator.serviceWorker.register('/learn/sw.js', { scope: '/learn/', type: 'module', updateViaCache: 'none' });
      const registration = installed?.active && !navigator.onLine ? installed : await navigator.serviceWorker.ready;
      registration.active.postMessage({ type: MESSAGE.cacheCourse, courseId: 'ai-toolkit', manifestUrl: '/learn/ai-toolkit/offline-manifest.json' });
    } catch {
      status.textContent = '保存失败，请联网后重试。';
      status.dataset.state = 'error';
      save.disabled = false;
    }
  });
}
