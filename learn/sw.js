import {
  MESSAGE,
  SHELL_ASSETS,
  cacheCourse,
  canonicalCourseAssetUrl,
  isLearnUrl,
  shellCacheName,
} from '/learn/offline-core.mjs';

const SHELL_VERSION = '2026-09-17-1';
const SHELL_CACHE = shellCacheName(SHELL_VERSION);
const RUNTIME_CACHE = 'ai-learning-runtime:1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('ai-learning-shell:') && name !== SHELL_CACHE)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

async function postToClient(client, message) {
  if (client) {
    client.postMessage(message);
    return;
  }
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const target of clients) target.postMessage(message);
}

self.addEventListener('message', (event) => {
  const { type, courseId, manifestUrl } = event.data ?? {};
  if (type !== MESSAGE.cacheCourse || !courseId || !manifestUrl) return;

  event.waitUntil((async () => {
    try {
      const result = await cacheCourse({
        cachesApi: caches,
        fetchImpl: fetch,
        courseId,
        manifestUrl: new URL(manifestUrl, self.location.origin).href,
        origin: self.location.origin,
        onProgress: (completed, total) => {
          postToClient(event.source, {
            type: MESSAGE.progress,
            courseId,
            completed,
            total,
          });
        },
      });
      await postToClient(event.source, {
        type: MESSAGE.ready,
        courseId,
        version: result.version,
        total: result.total,
      });
    } catch (error) {
      await postToClient(event.source, {
        type: MESSAGE.error,
        courseId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })());
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return await caches.match(request)
      ?? await caches.match('/learn/offline.html');
  }
}

async function courseCacheFirst(request) {
  const canonical = canonicalCourseAssetUrl(request.url);
  const cached = await caches.match(canonical);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(canonical, response.clone());
    }
    return response;
  } catch {
    if (request.mode === 'navigate') {
      return await caches.match('/learn/offline.html');
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isLearnUrl(request.url, self.location.origin)) return;
  const url = new URL(request.url);
  if (url.pathname === '/learn/' || url.pathname === '/learn/index.html') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/learn/ai-agent-book/')) {
    event.respondWith(courseCacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
