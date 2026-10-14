export const MESSAGE = Object.freeze({
  cacheCourse: 'CACHE_COURSE',
  progress: 'CACHE_PROGRESS',
  ready: 'CACHE_READY',
  error: 'CACHE_ERROR',
  activate: 'ACTIVATE_LEARNING_WORKER',
});

const SHELL_PREFIX = 'ai-learning-shell:';
const COURSE_PREFIX = 'ai-learning-course:';
export const LEARNING_DOCUMENT_VERSION='2026-10-14-1';
export function prepareLearningDocument({storage,version,hadController}) {
  try {
    const previous=storage.getItem('ai-learning-document');
    if(previous===`ready:${version}`)return 'ready';
    if(hadController&&previous!==`reloading:${version}`){storage.setItem('ai-learning-document',`reloading:${version}`);return 'reload';}
    storage.setItem('ai-learning-document',`ready:${version}`);return 'ready';
  }catch{return 'unsupported';}
}
export async function waitForWorkerActivation(registration,getCurrent=()=>navigator.serviceWorker.getRegistration(registration.scope)){
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    const current=await getCurrent();
    if(current?.active?.state==='activated'&&!current.installing&&!current.waiting)return;
    if(!current)throw new Error('阅读器注册不可用');
    if(current.waiting?.state==='installed')current.waiting.postMessage({type:MESSAGE.activate});
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('阅读器升级超时');
}

export const SHELL_ASSETS = Object.freeze([
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

export function isLearnUrl(value, origin) {
  const url = new URL(value, origin);
  return url.origin === origin && (
    url.pathname === '/learn' ||
    url.pathname === '/learn/' ||
    url.pathname.startsWith('/learn/')
  );
}

export function shellCacheName(version) {
  return `${SHELL_PREFIX}${version}`;
}

export function courseCacheName(courseId, version) {
  return `${COURSE_PREFIX}${courseId}:${version}`;
}

export function canonicalCourseAssetUrl(value) {
  const url = new URL(value);
  if (url.pathname.endsWith('/')) url.pathname += 'index.html';
  url.hash = '';
  return url.href;
}

const isNewPack=id=>/^ai-from-scratch(?:-(?:phase|project)-[a-z0-9-]+)?$/.test(id);
const completionUrl=(origin,id)=>`${origin}/learn/ai-from-scratch/__complete__/${encodeURIComponent(id)}`;
export async function matchSavedPackAsset({cachesApi,packId,requestUrl,runtimeCacheName}) {
  if(!isNewPack(packId))return undefined;
  const url=new URL(requestUrl),canonical=canonicalCourseAssetUrl(requestUrl);
  for(const name of (await cachesApi.keys()).filter(n=>n.startsWith(`${COURSE_PREFIX}${packId}:`))) {
    const cache=await cachesApi.open(name);
    if(!await cache.match(completionUrl(url.origin,packId)))continue;
    const response=await cache.match(canonical);if(response)return response;
  }
  return runtimeCacheName?(await cachesApi.open(runtimeCacheName)).match(canonical):undefined;
}
export async function getSavedPacks({cachesApi,packs,origin}) {
  const names=await cachesApi.keys(),saved=new Set();
  for(const pack of packs) {
    if(!isNewPack(pack.id))continue;
    for(const name of names.filter(n=>n.startsWith(`${COURSE_PREFIX}${pack.id}:`))) {
      if(await(await cachesApi.open(name)).match(completionUrl(origin,pack.id))){saved.add(pack.id);break;}
    }
  }
  for(const pack of packs)if(pack.dependencies?.some(id=>!saved.has(id)))saved.delete(pack.id);
  return saved;
}

export async function runtimeNetworkResponse({request,fetchImpl,cachesApi,runtimeCacheName,waitUntil}) {
  const response=await fetchImpl(canonicalCourseAssetUrl(request.url),{credentials:'same-origin',cache:request.cache==='only-if-cached'?'default':request.cache});
  if(response.url&&new URL(response.url).origin!==new URL(request.url).origin)throw new Error('Runtime asset redirected outside origin');
  if(response.ok){const copy=response.clone();waitUntil(cachesApi.open(runtimeCacheName).then(cache=>cache.put(canonicalCourseAssetUrl(request.url),copy)).catch(()=>{}));}
  return response;
}

export async function savedDownloadResponse({request,cachesApi,fetchImpl,waitUntil}) {
  const cache=await cachesApi.open('ai-from-scratch-downloads:v1');
  const key=canonicalCourseAssetUrl(request.url),old=await cache.match(key);
  const reload=['reload','no-cache','no-store'].includes(request.cache);
  if(old&&!reload)return old;
  try {const response=await fetchImpl(request);if(response.ok){const copy=response.clone();waitUntil(cache.put(key,copy).catch(()=>{}));return response;}if(old)return old;return response;}catch(e){if(old)return old;throw e;}
}

export async function matchCourseAsset({ cachesApi, courseId, requestUrl, runtimeCacheName }) {
  const canonical = canonicalCourseAssetUrl(requestUrl);
  const prefix = `${COURSE_PREFIX}${courseId}:`;
  for (const name of (await cachesApi.keys()).filter((name) => name.startsWith(prefix))) {
    const match = await (await cachesApi.open(name)).match(canonical);
    if (match) return match;
  }
  return (await cachesApi.open(runtimeCacheName)).match(canonical);
}

export function offlineStatusFromMessage(message) {
  if (message.type === MESSAGE.progress) {
    return {
      text: `正在准备离线内容（${message.completed}/${message.total}）`,
      state: 'progress',
    };
  }
  if (message.type === MESSAGE.ready) {
    return { text: '已可离线阅读', state: 'ready' };
  }
  if (message.type === MESSAGE.error) {
    return { text: '离线准备失败，可重试', state: 'error' };
  }
  return null;
}

function validateManifest(manifest, origin) {
  if (!manifest || typeof manifest !== 'object') {
    throw new TypeError('Offline manifest must be an object');
  }
  if (typeof manifest.version !== 'string' || !manifest.version) {
    throw new TypeError('Offline manifest must have a version');
  }
  if (typeof manifest.sourceCommit !== 'string' || !manifest.sourceCommit) {
    throw new TypeError('Offline manifest must have a source commit');
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new TypeError('Offline manifest must list at least one asset');
  }
  const assets = manifest.assets.map((asset) => {
    if (typeof asset !== 'string') {
      throw new TypeError('Offline manifest assets must be strings');
    }
    const url = new URL(asset, origin);
    if (!isLearnUrl(url, origin)) {
      throw new TypeError(`Offline asset is outside /learn/: ${asset}`);
    }
    return canonicalCourseAssetUrl(url.href);
  });
  if (new Set(assets).size !== assets.length) {
    throw new TypeError('Offline manifest contains duplicate assets');
  }
  return { ...manifest, assets };
}

async function cacheIsComplete(cache, assets) {
  const matches = await Promise.all(assets.map((asset) => cache.match(asset)));
  return matches.every(Boolean);
}

const packLocks=new WeakMap();
export async function cacheCourse(args) {
  if(!isNewPack(args.courseId))return cacheCourseUnlocked(args);
  let locks=packLocks.get(args.cachesApi);if(!locks){locks=new Map();packLocks.set(args.cachesApi,locks);}
  const previous=locks.get(args.courseId)??Promise.resolve();
  const task=previous.catch(()=>{}).then(()=>cacheCourseUnlocked(args));locks.set(args.courseId,task);
  try{return await task;}finally{if(locks.get(args.courseId)===task)locks.delete(args.courseId);}
}
async function cacheCourseUnlocked({
  cachesApi,
  fetchImpl,
  courseId,
  manifestUrl,
  origin,
  onProgress,
}) {
  let manifestResponse;
  let networkError;
  try {
    manifestResponse = await fetchImpl(manifestUrl, { cache: 'no-store' });
    if (!manifestResponse.ok) {
      throw new Error(`Manifest request failed with ${manifestResponse.status}`);
    }
  } catch (error) {
    networkError = error;
    manifestResponse = await cachesApi.match(manifestUrl);
  }
  if (!manifestResponse) {
    throw networkError ?? new Error('Offline manifest is unavailable');
  }
  const manifestForCache = manifestResponse.clone();
  const manifest = validateManifest(await manifestResponse.json(), origin);
  const pack=isNewPack(courseId);
  if(courseId.startsWith('ai-from-scratch')&&!pack)throw new Error('Invalid pack id');
  if(pack&&(manifest.packId!==courseId||manifest.assets.some(a=>!new URL(a).pathname.startsWith('/learn/ai-from-scratch/'))))throw new Error('Pack ownership or album boundary mismatch');
  const activeName = courseCacheName(courseId, manifest.version);
  const existingNames = await cachesApi.keys();
  const activeCache = await cachesApi.open(activeName);

  if (
    existingNames.includes(activeName) &&
    await cacheIsComplete(activeCache, manifest.assets) &&
    (!pack || await activeCache.match(completionUrl(origin,courseId)))
  ) {
    return { version: manifest.version, total: manifest.assets.length, reused: true };
  }

  try {
    await activeCache.put(manifestUrl, manifestForCache);
    let completed = 0;
    for (const asset of manifest.assets) {
      const response = await fetchImpl(asset, { cache: 'reload' });
      if (!response.ok) {
        throw new Error(`Asset request failed with ${response.status}: ${asset}`);
      }
      if(pack&&response.url&&new URL(response.url).origin!==origin)throw new Error('Pack asset redirected outside origin');
      await activeCache.put(asset, response);
      completed += 1;
      onProgress(completed, manifest.assets.length);
    }
    if(pack)await activeCache.put(completionUrl(origin,courseId),new Response(JSON.stringify({version:manifest.version,packId:courseId}),{headers:{'content-type':'application/json'}}));
  } catch (error) {
    if(!pack||!await activeCache.match(completionUrl(origin,courseId)))await cachesApi.delete(activeName);
    throw error;
  }

  const coursePrefix = `${COURSE_PREFIX}${courseId}:`;
  const namesAfterWrite = pack ? existingNames : await cachesApi.keys();
  await Promise.all(
    namesAfterWrite
      .filter((name) => name.startsWith(coursePrefix) && name !== activeName)
      .map((name) => cachesApi.delete(name)),
  );

  return { version: manifest.version, total: manifest.assets.length, reused: false };
}
