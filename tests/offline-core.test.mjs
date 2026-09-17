import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheCourse,
  canonicalCourseAssetUrl,
  courseCacheName,
  isLearnUrl,
  offlineStatusFromMessage,
  SHELL_ASSETS,
} from '../learn/offline-core.mjs';

class MemoryCache {
  entries = new Map();

  async put(request, response) {
    this.entries.set(String(request), response.clone());
  }

  async match(request) {
    return this.entries.get(String(request));
  }
}

class MemoryCaches {
  stores = new Map();

  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache());
    return this.stores.get(name);
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name) {
    return this.stores.delete(name);
  }

  async match(request) {
    for (const cache of this.stores.values()) {
      const match = await cache.match(request);
      if (match) return match;
    }
    return undefined;
  }
}

const origin = 'https://serebiisme.github.io';
const manifestUrl = `${origin}/learn/ai-agent-book/offline-manifest.json`;
const assets = [
  '/learn/ai-agent-book/index.html',
  '/learn/ai-agent-book/book/chapter1/index.html',
];

function response(body, status = 200, type = 'text/plain') {
  return new Response(body, { status, headers: { 'content-type': type } });
}

function successfulFetch(log) {
  return async (request) => {
    const url = String(request);
    log.push(url);
    if (url === manifestUrl) {
      return response(
        JSON.stringify({ version: 'v2', sourceCommit: 'abc', assets }),
        200,
        'application/json',
      );
    }
    return response(`asset:${url}`);
  };
}

test('scope matching rejects other origins and pages outside /learn/', () => {
  assert.equal(isLearnUrl(`${origin}/learn/`, origin), true);
  assert.equal(isLearnUrl(`${origin}/learn/course/`, origin), true);
  assert.equal(isLearnUrl(`${origin}/`, origin), false);
  assert.equal(isLearnUrl('https://example.com/learn/', origin), false);
});

test('cache names isolate course and version', () => {
  assert.equal(
    courseCacheName('ai-agent-book', 'a1b2'),
    'ai-learning-course:ai-agent-book:a1b2',
  );
});

test('directory requests resolve to the cached index document', () => {
  assert.equal(
    canonicalCourseAssetUrl(`${origin}/learn/ai-agent-book/book/chapter1/`),
    `${origin}/learn/ai-agent-book/book/chapter1/index.html`,
  );
  assert.equal(
    canonicalCourseAssetUrl(`${origin}/learn/ai-agent-book/_astro/app.js`),
    `${origin}/learn/ai-agent-book/_astro/app.js`,
  );
});

test('new course cache becomes ready before the old version is removed', async () => {
  const cachesApi = new MemoryCaches();
  const oldName = courseCacheName('ai-agent-book', 'v1');
  await cachesApi.open(oldName);
  const fetched = [];
  const progress = [];

  const result = await cacheCourse({
    cachesApi,
    fetchImpl: successfulFetch(fetched),
    courseId: 'ai-agent-book',
    manifestUrl,
    origin,
    onProgress: (completed, total) => progress.push([completed, total]),
  });

  assert.deepEqual(result, { version: 'v2', total: 2, reused: false });
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.equal((await cachesApi.keys()).includes(oldName), false);
  const active = await cachesApi.open(courseCacheName('ai-agent-book', 'v2'));
  assert.ok(await active.match(`${origin}${assets[0]}`));
  assert.ok(await active.match(`${origin}${assets[1]}`));
  assert.deepEqual(fetched, [manifestUrl, ...assets.map((path) => `${origin}${path}`)]);
});

test('failed replacement is deleted while the previous complete cache remains', async () => {
  const cachesApi = new MemoryCaches();
  const oldName = courseCacheName('ai-agent-book', 'v1');
  await cachesApi.open(oldName);
  const fetchImpl = async (request) => {
    const url = String(request);
    if (url === manifestUrl) {
      return response(
        JSON.stringify({ version: 'v2', sourceCommit: 'abc', assets }),
        200,
        'application/json',
      );
    }
    return url.endsWith('/book/chapter1/index.html')
      ? response('broken', 503)
      : response('ok');
  };

  await assert.rejects(
    cacheCourse({
      cachesApi,
      fetchImpl,
      courseId: 'ai-agent-book',
      manifestUrl,
      origin,
      onProgress: () => {},
    }),
    /503/,
  );

  const names = await cachesApi.keys();
  assert.deepEqual(names, [oldName]);
});

test('complete matching cache is reused without downloading course assets', async () => {
  const cachesApi = new MemoryCaches();
  const active = await cachesApi.open(courseCacheName('ai-agent-book', 'v2'));
  for (const asset of assets) await active.put(`${origin}${asset}`, response('cached'));
  const fetched = [];

  const result = await cacheCourse({
    cachesApi,
    fetchImpl: successfulFetch(fetched),
    courseId: 'ai-agent-book',
    manifestUrl,
    origin,
    onProgress: () => {},
  });

  assert.deepEqual(result, { version: 'v2', total: 2, reused: true });
  assert.deepEqual(fetched, [manifestUrl]);
});

test('offline revisit reuses the cached manifest and complete course cache', async () => {
  const cachesApi = new MemoryCaches();
  await cacheCourse({
    cachesApi,
    fetchImpl: successfulFetch([]),
    courseId: 'ai-agent-book',
    manifestUrl,
    origin,
    onProgress: () => {},
  });

  const result = await cacheCourse({
    cachesApi,
    fetchImpl: async () => {
      throw new TypeError('offline');
    },
    courseId: 'ai-agent-book',
    manifestUrl,
    origin,
    onProgress: () => {},
  });

  assert.deepEqual(result, { version: 'v2', total: 2, reused: true });
});

test('shell cache contains every file needed to recover the course library', () => {
  assert.deepEqual(SHELL_ASSETS, [
    '/learn/',
    '/learn/index.html',
    '/learn/styles.css',
    '/learn/app.js',
    '/learn/offline-core.mjs',
    '/learn/courses.json',
    '/learn/manifest.webmanifest',
    '/learn/icon.svg',
    '/learn/offline.html',
  ]);
});

test('cache messages map to truthful visible status', () => {
  assert.deepEqual(
    offlineStatusFromMessage({
      type: 'CACHE_PROGRESS',
      completed: 7,
      total: 12,
    }),
    { text: '正在准备离线内容（7/12）', state: 'progress' },
  );
  assert.deepEqual(
    offlineStatusFromMessage({ type: 'CACHE_READY' }),
    { text: '已可离线阅读', state: 'ready' },
  );
  assert.deepEqual(
    offlineStatusFromMessage({ type: 'CACHE_ERROR' }),
    { text: '离线准备失败，可重试', state: 'error' },
  );
});
