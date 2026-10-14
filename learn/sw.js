import {
  MESSAGE,
  SHELL_ASSETS,
  cacheCourse,
  canonicalCourseAssetUrl,
  isLearnUrl,
  matchCourseAsset,
  matchSavedPackAsset,
  runtimeNetworkResponse,
  savedDownloadResponse,
  LEARNING_DOCUMENT_VERSION,
  shellCacheName,
} from '/learn/offline-core.mjs';

const SHELL_VERSION = LEARNING_DOCUMENT_VERSION;
const SHELL_CACHE = shellCacheName(SHELL_VERSION);
const RUNTIME_CACHE = 'ai-learning-runtime:1';

self.addEventListener('install', (event) => {
  event.waitUntil((async()=>{
    await(await caches.open(SHELL_CACHE)).addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
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
  if(type===MESSAGE.activate){event.waitUntil(self.skipWaiting());return;}
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
  const cached = new URL(request.url).pathname.startsWith('/learn/ai-toolkit/')
    ? await matchCourseAsset({ cachesApi: caches, courseId: 'ai-toolkit', requestUrl: request.url, runtimeCacheName: RUNTIME_CACHE })
    : await caches.match(canonical);
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

async function curriculumCacheFirst(request,event){
  const canonical=canonicalCourseAssetUrl(request.url),origin=self.location.origin;
  const downloads=request.url.startsWith(origin+'/learn/ai-from-scratch/downloads/');
  if(downloads){try{return await savedDownloadResponse({request,cachesApi:caches,fetchImpl:fetch,waitUntil:p=>event.waitUntil(p)});}catch{return Response.error();}}
  let registryResponse=await matchSavedPackAsset({cachesApi:caches,packId:'ai-from-scratch',requestUrl:origin+'/learn/ai-from-scratch/packs.json'});
  if(registryResponse){
    const registry=await registryResponse.json();
    for(const id of registry.routes?.[new URL(canonical).pathname]??[]){const saved=await matchSavedPackAsset({cachesApi:caches,packId:id,requestUrl:canonical});if(saved)return saved;}
  }
  try{return await runtimeNetworkResponse({request,fetchImpl:fetch,cachesApi:caches,runtimeCacheName:RUNTIME_CACHE,waitUntil:p=>event.waitUntil(p)});}catch{
    const temporary=await(await caches.open(RUNTIME_CACHE)).match(canonical);
    if(temporary)return temporary;
    return request.mode==='navigate'?await caches.match('/learn/offline.html'):Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isLearnUrl(request.url, self.location.origin)) return;
  const url = new URL(request.url);
  if(url.pathname.startsWith('/learn/ai-from-scratch/')){
    event.respondWith(curriculumCacheFirst(request,event));return;
  }
  if (url.pathname === '/learn/' || url.pathname === '/learn/index.html') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/learn/ai-agent-book/') || url.pathname.startsWith('/learn/ai-engineering/') || url.pathname.startsWith('/learn/ai-toolkit/')) {
    event.respondWith(courseCacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
