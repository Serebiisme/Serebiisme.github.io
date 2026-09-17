const grid = document.querySelector('#course-grid');
const status = document.querySelector('#library-status');
const template = document.querySelector('#course-card-template');

function renderCourse(course, index) {
  const fragment = template.content.cloneNode(true);
  fragment.querySelector('[data-course-number]').textContent =
    String(index + 1).padStart(2, '0');
  fragment.querySelector('[data-course-chapters]').textContent =
    `${course.chapterCount} 章`;
  fragment.querySelector('[data-course-title]').textContent = course.title;
  fragment.querySelector('[data-course-author]').textContent =
    `作者：${course.author}`;
  fragment.querySelector('[data-course-source]').textContent =
    `固定版本：${course.sourceCommit.slice(0, 7)} · ${course.license}`;
  fragment.querySelector('[data-course-link]').href = course.route;
  fragment.querySelector('[data-course-license]').href =
    `${course.route}SOURCE.md`;
  fragment.querySelector('[data-offline-status]').dataset.courseId = course.id;
  return fragment;
}

async function loadCourses() {
  try {
    const response = await fetch('/learn/courses.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`课程目录请求失败：${response.status}`);
    const courses = await response.json();
    grid.replaceChildren(...courses.map(renderCourse));
    status.textContent = `已收录 ${courses.length} 门课程`;
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
  }
}

loadCourses();
