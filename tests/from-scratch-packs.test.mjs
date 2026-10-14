import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheCourse,courseCacheName,matchSavedPackAsset,getSavedPacks,runtimeNetworkResponse,savedDownloadResponse} from '../learn/offline-core.mjs';
class Cache{entries=new Map();async put(k,v){this.entries.set(String(k),v.clone());}async match(k){return this.entries.get(String(k))?.clone();}}
class Caches{stores=new Map();async open(k){if(!this.stores.has(k))this.stores.set(k,new Cache());return this.stores.get(k);}async keys(){return [...this.stores.keys()];}async delete(k){return this.stores.delete(k);}async match(k){for(const c of this.stores.values()){const r=await c.match(k);if(r)return r;}}}
const origin='https://example.test',id='ai-from-scratch-phase-00-basic',manifestUrl=origin+'/learn/ai-from-scratch/manifests/'+id+'.json',asset=origin+'/learn/ai-from-scratch/lessons/00-basic/01-first/index.html';
const body=(version)=>JSON.stringify({packId:id,sourceCommit:'abc',version,assets:[asset]});
test('two tabs saving the same pack cannot erase a successful version',async()=>{
 const cachesApi=new Caches();await cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async u=>new Response(u===manifestUrl?body('old'):'old')});
 let release,started;const arrived=new Promise(r=>started=r),blocked=new Promise(r=>release=r);let requests=0;
 const fetchImpl=async u=>{if(u===manifestUrl)return new Response(body('new'));requests++;if(requests===1){started();await blocked;return new Response('new');}throw new Error('second overlapping save failed');};
 const a=cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl});await arrived;
 const b=cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl}).catch(e=>({error:e.message}));
 await new Promise(r=>setTimeout(r,10));release();await a;const result=await b;
 assert.equal(result.reused,true);assert.equal(requests,1);assert.equal(await(await matchSavedPackAsset({cachesApi,packId:id,requestUrl:asset})).text(),'new');
});
test('an older worker failing after a new worker completes cannot delete the completed cache',async()=>{
 const cachesApi=new Caches(),otherWorker=Object.create(cachesApi);
 await cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async u=>new Response(u===manifestUrl?body('old'):'old')});
 let releaseA,failB,startA,startB;const arrivedA=new Promise(r=>startA=r),arrivedB=new Promise(r=>startB=r),holdA=new Promise(r=>releaseA=r),holdB=new Promise((_,reject)=>failB=reject);
 const a=cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async u=>{if(u===manifestUrl)return new Response(body('new'));startA();await holdA;return new Response('new');}});
 await arrivedA;const b=cacheCourse({cachesApi:otherWorker,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async u=>{if(u===manifestUrl)return new Response(body('new'));startB();await holdB;return new Response('never');}}).catch(e=>e);
 await arrivedB;releaseA();await a;failB(new Error('old worker interrupted'));assert.ok(await b instanceof Error);
 const saved=await matchSavedPackAsset({cachesApi,packId:id,requestUrl:asset});assert.ok(saved,'new worker completed pack still exists');assert.equal(await saved.text(),'new');
});
test('late completion of an older worker version cannot remove a newer version created after it started',async()=>{
 const cachesApi=new Caches(),otherWorker=Object.create(cachesApi);let release,start;const entered=new Promise(r=>start=r),hold=new Promise(r=>release=r);
 const a=cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async u=>{if(u===manifestUrl)return new Response(body('v1'));start();await hold;return new Response('older');}});
 await entered;await cacheCourse({cachesApi:otherWorker,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async u=>new Response(u===manifestUrl?body('v2'):'newer')});
 release();await a;const latest=await matchSavedPackAsset({cachesApi,packId:id,requestUrl:asset});assert.ok(latest);assert.equal(await latest.text(),'newer');
});
test('explicit ZIP reload receives new network bytes while an offline revisit retains the saved ZIP',async()=>{
 const cachesApi=new Caches(),url=origin+'/learn/ai-from-scratch/downloads/demo.zip',background=[];
 await(await cachesApi.open('ai-from-scratch-downloads:v1')).put(url,new Response('old ZIP'));
 const fresh=await savedDownloadResponse({request:new Request(url,{cache:'reload'}),cachesApi,fetchImpl:async()=>new Response('new ZIP'),waitUntil:p=>background.push(p)});
 assert.equal(await fresh.text(),'new ZIP');await Promise.all(background);
 const offline=await savedDownloadResponse({request:new Request(url),cachesApi,fetchImpl:async()=>{throw new Error('offline');},waitUntil:p=>background.push(p)});
 assert.equal(await offline.text(),'new ZIP');
});
test('optional temporary-cache failure never blocks a successful online reading response',async()=>{
 const background=[];
 const response=await runtimeNetworkResponse({request:new Request(asset),fetchImpl:async(url,options)=>{assert.equal(url,asset);assert.equal(options.credentials,'same-origin');return new Response('online lesson');},cachesApi:{open:async()=>({put:async()=>{throw new Error('QuotaExceededError');}})},runtimeCacheName:'runtime',waitUntil:p=>background.push(p)});
 assert.equal(await response.text(),'online lesson');await Promise.all(background);
});
test('incomplete new pack cannot mask saved old content and failed updates preserve unrelated packs',async()=>{
 const cachesApi=new Caches(),runtimeCacheName='runtime';
 await cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async url=>new Response(url===manifestUrl?body('old'):'complete old')});
 await(await cachesApi.open(runtimeCacheName)).put(asset,new Response('stale temporary'));
 await(await cachesApi.open(courseCacheName(id,'partial'))).put(asset,new Response('partial new'));
 assert.equal(await(await matchSavedPackAsset({cachesApi,packId:id,requestUrl:asset,runtimeCacheName})).text(),'complete old');
 await(await cachesApi.open(courseCacheName('ai-from-scratch-phase-01-other','v1'))).put('keep',new Response('keep'));
 await assert.rejects(cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async url=>{if(url===manifestUrl)return new Response(body('new'));throw new Error('quota/network');}}),/quota/);
 assert.ok((await cachesApi.keys()).includes(courseCacheName(id,'old')));assert.ok((await cachesApi.keys()).includes(courseCacheName('ai-from-scratch-phase-01-other','v1')));
});
test('saved status is obtained from completion markers not a stale browser preference',async()=>{
 const cachesApi=new Caches(),packs=[{id,dependencies:[]}];assert.equal((await getSavedPacks({cachesApi,packs,origin})).size,0);
 await cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async url=>new Response(url===manifestUrl?body('old'):'saved')});
 assert.ok((await getSavedPacks({cachesApi,packs,origin})).has(id));await cachesApi.delete(courseCacheName(id,'old'));assert.equal((await getSavedPacks({cachesApi,packs,origin})).size,0);
});
test('new packs reject wrong ownership and resources outside this album before writing',async()=>{
 for(const manifest of [{packId:'wrong',version:'v',sourceCommit:'abc',assets:[asset]},{packId:id,version:'v',sourceCommit:'abc',assets:['/learn/ai-toolkit/index.html']}]){
 const cachesApi=new Caches();await assert.rejects(cacheCourse({cachesApi,courseId:id,manifestUrl,origin,onProgress:()=>{},fetchImpl:async()=>new Response(JSON.stringify(manifest))}),/pack|album|owner/i);assert.equal((await cachesApi.keys()).length,0);
 }
});
