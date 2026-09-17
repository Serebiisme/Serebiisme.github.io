export const MESSAGE = Object.freeze({
  cacheCourse: 'CACHE_COURSE',
  progress: 'CACHE_PROGRESS',
  ready: 'CACHE_READY',
  error: 'CACHE_ERROR',
});

const SHELL_PREFIX = 'ai-learning-shell:';
const COURSE_PREFIX = 'ai-learning-course:';

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

export async function cacheCourse({
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
  const activeName = courseCacheName(courseId, manifest.version);
  const existingNames = await cachesApi.keys();
  const activeCache = await cachesApi.open(activeName);

  if (
    existingNames.includes(activeName) &&
    await cacheIsComplete(activeCache, manifest.assets)
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
      await activeCache.put(asset, response);
      completed += 1;
      onProgress(completed, manifest.assets.length);
    }
  } catch (error) {
    await cachesApi.delete(activeName);
    throw error;
  }

  const coursePrefix = `${COURSE_PREFIX}${courseId}:`;
  const namesAfterWrite = await cachesApi.keys();
  await Promise.all(
    namesAfterWrite
      .filter((name) => name.startsWith(coursePrefix) && name !== activeName)
      .map((name) => cachesApi.delete(name)),
  );

  return { version: manifest.version, total: manifest.assets.length, reused: false };
}
