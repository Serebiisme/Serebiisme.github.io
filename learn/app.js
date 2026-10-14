import { MESSAGE, offlineStatusFromMessage,prepareLearningDocument,waitForWorkerActivation,LEARNING_DOCUMENT_VERSION } from '/learn/offline-core.mjs';

const grid = document.querySelector('#course-grid');
const status = document.querySelector('#library-status');
const template = document.querySelector('#course-card-template');
const coursesById = new Map();
let serviceWorkerRegistration;
const hadController=Boolean(navigator.serviceWorker?.controller);

function renderCourse(course, index) {
  const fragment = template.content.cloneNode(true);
  fragment.querySelector('.course-card').dataset.courseId = course.id;
  if (course.id === 'ai-engineering') {
    fragment.querySelector('.course-visual').replaceChildren(
      document.querySelector('#interview-cover-template').content.cloneNode(true),
    );
    fragment.querySelector('.course-kicker').textContent = 'Interview / 面试题库';
  }
  if (course.id === 'ai-toolkit') {
    fragment.querySelector('.course-visual').replaceChildren(
      document.querySelector('#toolkit-cover-template').content.cloneNode(true),
    );
    fragment.querySelector('.course-kicker').textContent = 'Original guides / 中文原创';
    fragment.querySelector('[data-course-link]').textContent = '进入合集';
    fragment.querySelector('[data-course-license]').textContent = '编写与来源';
  }
  if(course.id==='ai-from-scratch') {
    fragment.querySelector('.course-visual').replaceChildren(document.querySelector('#scratch-cover-template').content.cloneNode(true));
    fragment.querySelector('.course-kicker').textContent='From scratch / 双语离线阅读';
    fragment.querySelector('[data-offline-status]').textContent='进入课程，按阶段保存 · 中文草稿明确标注';
  }
  fragment.querySelector('[data-course-number]').textContent =
    String(index + 1).padStart(2, '0');
  fragment.querySelector('[data-course-chapters]').textContent =
    course.phaseCount ? `${course.phaseCount} 阶段 · ${course.chapterCount} 课 · ${course.projectCount} 项目` : course.guideCount ? `${course.guideCount} 分区 · ${course.chapterCount} 节` : `${course.chapterCount} 章`;
  fragment.querySelector('[data-course-title]').textContent = course.title;
  fragment.querySelector('[data-course-author]').textContent =
    `作者：${course.author}`;
  fragment.querySelector('[data-course-source]').textContent =
    `${course.id === 'ai-toolkit' ? '主题参考版本' : '固定版本'}：${course.sourceCommit.slice(0, 7)} · ${course.license}`;
  fragment.querySelector('[data-course-link]').href = course.route;
  fragment.querySelector('[data-course-license]').href =
    `${course.route}SOURCE.md`;
  fragment.querySelector('[data-offline-status]').dataset.courseId = course.id;
  coursesById.set(course.id, course);
  return fragment;
}

async function loadCourses() {
  try {
    const response = await fetch('/learn/courses.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`课程目录请求失败：${response.status}`);
    const courses = await response.json();
    grid.replaceChildren(...courses.map(renderCourse));
    status.textContent = `已收录 ${courses.length} 门课程`;
    return courses;
  } catch (error) {
    status.textContent = '课程目录载入失败';
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.append('暂时无法载入课程目录。你可以前往');
    const link = document.createElement('a');
    link.href = 'https://github.com/bojieli/ai-agent-book';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = '原课程仓库';
    notice.append(link, '继续阅读。');
    grid.replaceChildren(notice);
    console.error(error);
    return null;
  }
}

function statusElement(courseId) {
  return document.querySelector(`[data-offline-status][data-course-id="${courseId}"]`);
}

function postCacheRequest(course) {
  const worker = serviceWorkerRegistration?.active
    ?? serviceWorkerRegistration?.waiting
    ?? serviceWorkerRegistration?.installing;
  worker?.postMessage({
    type: MESSAGE.cacheCourse,
    courseId: course.id,
    manifestUrl: course.offlineManifest,
  });
}

function renderOfflineStatus(message) {
  const element = statusElement(message.courseId);
  const visible = offlineStatusFromMessage(message);
  if (!element || !visible) return;
  element.dataset.state = visible.state;
  element.replaceChildren(visible.text);
  if (visible.state === 'error') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry-button';
    retry.textContent = '重试';
    retry.addEventListener('click', () => {
      element.replaceChildren('正在重新准备离线内容…');
      postCacheRequest(coursesById.get(message.courseId));
    });
    element.append(' ', retry);
  }
}

async function initializeOffline(courses) {
  if (!('serviceWorker' in navigator)) {
    for (const course of courses) {
      const element = statusElement(course.id);
      element.textContent = '当前浏览器不支持离线缓存，可继续在线阅读';
      element.dataset.state = 'unsupported';
    }
    return;
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    renderOfflineStatus(event.data);
  });

  try {
    serviceWorkerRegistration=await navigator.serviceWorker.register('/learn/sw.js', {
      scope: '/learn/',
      type: 'module',
      updateViaCache: 'none',
    });
    await waitForWorkerActivation(serviceWorkerRegistration);
    serviceWorkerRegistration = await navigator.serviceWorker.ready;
    if(prepareLearningDocument({storage:sessionStorage,version:LEARNING_DOCUMENT_VERSION,hadController})==='reload'){location.reload();return;}
    for (const course of courses) if(course.autoCache!==false) postCacheRequest(course);
  } catch (error) {
    for (const course of courses) {
      renderOfflineStatus({ type: MESSAGE.error, courseId: course.id });
    }
    console.error(error);
  }
}

const courses = await loadCourses();
if (courses) await initializeOffline(courses);
