import assert from 'node:assert/strict';
import {readFile,stat,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {waitForBrowserCondition} from './from-scratch/browser-check.mjs';

const root=resolve('.'),basePath='/learn/ai-from-scratch/';
const catalog=JSON.parse(await readFile('content/ai-from-scratch/catalog.json','utf8'));
const registry=JSON.parse(await readFile('learn/ai-from-scratch/packs.json','utf8'));
const report={lessonPages:0,projectPages:0,quizCount:catalog.quizzes.length,reviewed:3,brokenLinks:[],externalContentRequests:[],offlineFailures:[],pageErrors:[],downloadRetries:[],widths:[],upgrade:false};
const pages=[basePath,...catalog.phases.map(p=>basePath+'phases/'+p.id+'/'),basePath+'projects/',...catalog.lessons.map(l=>basePath+'lessons/'+l.id+'/'),...catalog.projects.map(p=>basePath+'projects/'+p.id+'/')];
for(const pack of registry.packs){
 const manifest=JSON.parse(await readFile(resolve(root,pack.manifestUrl.slice(1)),'utf8'));let bytes=0;
 for(const path of manifest.assets){assert.ok(path.startsWith(basePath));assert.ok(!path.endsWith('.zip'));try{bytes+=(await stat(resolve(root,path.slice(1)))).size;}catch{report.brokenLinks.push(path);}}
 assert.equal(bytes,pack.bytes,'Actual pack size '+pack.id);
}
for(const path of pages){
 const html=await readFile(resolve(root,path.slice(1),'index.html'),'utf8');
 if(path.includes('/lessons/'))report.lessonPages++;if(/\/projects\/[^/]+\/$/.test(path))report.projectPages++;
 for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(!m[1].startsWith('/'))continue;const url=new URL(m[1],'http://localhost'),file=resolve(root,decodeURIComponent(url.pathname.slice(1))+(url.pathname.endsWith('/')?'index.html':''));
  try{await stat(file);}catch{report.brokenLinks.push({page:path,link:m[1]});}
 }
}
assert.equal(report.lessonPages,528);assert.equal(report.projectPages,76);assert.equal(report.quizCount,378);assert.equal(report.brokenLinks.length,0);
if(process.argv.includes('--static')){console.log(JSON.stringify(report));process.exit(0);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.zip':'application/zip','.txt':'text/plain','.md':'text/plain'};
let server;const oldFiles=new Map();let base=process.argv.includes('--base')?process.argv[process.argv.indexOf('--base')+1]:undefined;
if(!base){
 server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/'))throw new Error('bad path');let data=oldFiles.get(pathname)??await readFile(file);if(process.env.AIFS_DEBUG&&pathname==='/learn/sw.js')data=data.toString().replace('async function curriculumCacheFirst(request){','async function curriculumCacheFirst(request){ console.log("CF start",request.url);').replace('let registryResponse=await matchSavedPackAsset','console.log("before match");let registryResponse=await matchSavedPackAsset').replace('if(registryResponse){','console.log("after match",!!registryResponse);if(registryResponse){').replace('try{const response=await fetch(request);','try{console.log("before fetch",request.url); const response=await fetch(request);console.log("after fetch",request.url);');if(process.env.AIFS_DEBUG&&pathname.startsWith(basePath))console.log('HTTP',pathname);res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
}
const playwright=await import(process.env.AIFS_PLAYWRIGHT_MODULE??'playwright');
const launchOptions={headless:true,...(process.argv.includes('--chrome')?{channel:'chrome'}:{})};
const profileVersion=createHash('sha256').update(registry.packs.map(p=>p.version).join('|')).digest('hex').slice(0,16);
let browser,context;
if(server){browser=await playwright.chromium.launch(launchOptions);context=await browser.newContext({viewport:{width:1440,height:1000}});}
else{context=await playwright.chromium.launchPersistentContext(resolve('.superpowers/sdd/2026-10-14-ai-engineering-from-scratch-offline','public-browser-'+profileVersion),{...launchOptions,viewport:{width:1440,height:1000}});browser=context.browser();}
const page=await context.newPage();
// CDN cold/large responses need a network budget, not the local 30s default.
context.setDefaultTimeout(180000);context.setDefaultNavigationTimeout(180000);
if(process.env.AIFS_DEBUG)context.on('console',m=>console.log('CONSOLE',m.text()));
const outstanding=new Set();context.on('request',r=>outstanding.add(r.url()));context.on('requestfinished',r=>outstanding.delete(r.url()));context.on('requestfailed',r=>outstanding.delete(r.url()));
context.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin&&!r.url().startsWith('data:'))report.externalContentRequests.push(r.url());});
page.on('pageerror',e=>report.pageErrors.push(e.message));
page.on('console',m=>{if(m.type()==='error')console.log('BROWSER_ERROR',m.text());});
const workspace=resolve('.superpowers/sdd/2026-10-14-ai-engineering-from-scratch-offline');await mkdir(workspace,{recursive:true});
if(process.env.AIFS_DEBUG){server?.on('request',(req,res)=>{if(req.url.startsWith(basePath))res.on('finish',()=>console.log('HTTP_FINISHED',req.url));});}
try{
 // Start with the actual prior shell/worker, then upgrade the same browser.
 if(server&&!process.argv.includes('--fresh')){const oldWorker=execFileSync('git',['show','2720144:learn/sw.js'],{encoding:'utf8'}),oldCore=execFileSync('git',['show','2720144:learn/offline-core.mjs'],{encoding:'utf8'}),oldApp=execFileSync('git',['show','2720144:learn/app.js'],{encoding:'utf8'}),oldCourses=execFileSync('git',['show','2720144:learn/courses.json'],{encoding:'utf8'});
  oldFiles.set('/learn/sw.js',oldWorker);oldFiles.set('/learn/offline-core.mjs',oldCore);oldFiles.set('/learn/app.js',oldApp);oldFiles.set('/learn/courses.json',oldCourses);
  await page.goto(base+'/learn/');await page.waitForFunction(()=>document.querySelectorAll('[data-offline-status][data-state="ready"]').length===3,{},{timeout:180000});
  await page.evaluate(()=>localStorage.setItem('upgrade-fixture','preserved'));
  oldFiles.clear();await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration('/learn/')).update();});await waitForBrowserCondition(page,async()=>{const names=await caches.keys();return names.includes('ai-learning-shell:2026-10-14-1')&&!names.includes('ai-learning-shell:2026-10-13-4');});
  assert.equal(await page.evaluate(()=>localStorage.getItem('upgrade-fixture')),'preserved');report.upgrade=true;
 }
 const libraryRequests=[];page.on('request',r=>libraryRequests.push(r.url()));await page.goto(base+'/learn/');await page.waitForSelector('[data-course-id="ai-from-scratch"]');
 await waitForBrowserCondition(page,async()=>{const r=await navigator.serviceWorker.getRegistration('/learn/');return r?.active?.state==='activated'&&!r.waiting&&!r.installing;},{timeout:60000});
 await page.waitForFunction(()=>sessionStorage.getItem('ai-learning-document')==='ready:2026-10-14-1',{},{timeout:90000});
 assert.equal(libraryRequests.some(u=>u.includes('/ai-from-scratch/manifests/')),false,'Library never auto-downloads new packs');
 console.log(JSON.stringify({checkpoint:'library checked',upgrade:report.upgrade}));
 if(process.env.AIFS_DEBUG){console.log(JSON.stringify(await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/learn/');return {active:r.active?.state,waiting:r.waiting?.state,controller:navigator.serviceWorker.controller?.state,same:r.active===navigator.serviceWorker.controller};})));for(const worker of context.serviceWorkers())console.log('WORKER',await worker.evaluate(async()=>{self.__trace=[];self.addEventListener('fetch',e=>self.__trace.push(e.request.url));return {keys:await caches.keys()};}).catch(e=>e.message));}
 await page.goto(base+basePath,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-save-status]').textContent.includes('本包'));
 // An independent fresh context proves the unsaved fallback even on a resumed run.
 const missingContext=await browser.newContext();missingContext.setDefaultTimeout(180000);missingContext.setDefaultNavigationTimeout(180000);const missingPage=await missingContext.newPage();
 await missingPage.goto(base+basePath,{waitUntil:'domcontentloaded'});await missingPage.waitForFunction(()=>document.querySelector('[data-save-status]').textContent.includes('未保存'));await missingContext.setOffline(true);await missingPage.goto(base+basePath+'lessons/'+catalog.lessons.at(-1).id+'/');assert.ok(!(await missingPage.locator('body').getAttribute('data-lesson')),'Unsaved lesson shows offline fallback');await missingContext.close();
 // Bulk UI locally; eight real independent save-button tabs on the public CDN.
 // No test-only cache fill. Public per-pack budgets must not impose a 15m total.
 if(server){
  page.once('dialog',d=>d.accept());await page.locator('[data-save-all]').focus();await page.keyboard.press('Enter');
 }else{
  async function saveThroughButton(tab){
   await tab.waitForFunction(()=>document.querySelector('[data-save-status]').textContent.includes('本包'),undefined,{timeout:180000});
   for(let attempt=0;attempt<3;attempt++){
    await tab.locator('[data-save]').click();
    await tab.waitForFunction(()=>!document.querySelector('[data-save]').disabled,undefined,{timeout:900000});
    const text=await tab.locator('[data-save-status]').innerText();
    if(text.includes('本包已完整保存'))return;
    const transientNetwork=text.includes('Asset request failed with 503:')||text.includes('Cache.put() encountered a network error');
    if(!transientNetwork||attempt===2)throw new Error(text);
    const retry={page:tab.url(),attempt:attempt+1,message:text};report.downloadRetries.push(retry);console.log(JSON.stringify({publicRetry:retry}));
    await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
   }
  }
  await saveThroughButton(page);
  const queue=registry.packs.filter(p=>p.kind!=='shared');let finished=1;
  await Promise.all(Array.from({length:8},async()=>{
   const tab=await context.newPage();tab.on('pageerror',e=>report.pageErrors.push(e.message));
   try{while(queue.length){const pack=queue.shift();const path=pack.kind==='phase'?'phases/'+pack.id.slice('ai-from-scratch-phase-'.length):'projects/'+pack.id.slice('ai-from-scratch-project-'.length);await tab.goto(base+basePath+path+'/',{waitUntil:'domcontentloaded'});await saveThroughButton(tab);finished++;if(finished%10===0)console.log(JSON.stringify({publicSavedPacks:finished,total:97,method:'real save buttons / 8 tabs'}));}}finally{await tab.close();}
  }));
 }
 await waitForBrowserCondition(page,async()=>{const names=await caches.keys();let complete=0;for(const n of names.filter(n=>n.startsWith('ai-learning-course:ai-from-scratch:')||n.startsWith('ai-learning-course:ai-from-scratch-phase-')||n.startsWith('ai-learning-course:ai-from-scratch-project-'))){const id=n.slice('ai-learning-course:'.length).split(':')[0];if(await(await caches.open(n)).match(location.origin+'/learn/ai-from-scratch/__complete__/'+encodeURIComponent(id)))complete++;}return complete===97;},{timeout:900000});
 console.log(JSON.stringify({savedPacks:97}));
 await page.waitForFunction(()=>!document.querySelector('[data-save-all]').disabled);
 await context.setOffline(true);
 const checkPages=process.argv.includes('--all')?pages:[basePath,basePath+'lessons/'+catalog.lessons[0].id+'/',basePath+'lessons/'+catalog.lessons.at(-1).id+'/',basePath+'projects/'+catalog.projects[0].id+'/'];
 let checked=0;
 for(const path of checkPages){try{
   const response=await page.goto(base+path,{waitUntil:'load'});assert.ok(response.ok());assert.ok(await page.locator('.topbar a[href="/notes/"]').count());
   if(path.includes('/lessons/')){assert.ok(await page.locator('[data-lang="zh"]').count());await page.locator('[data-language="en"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-lang="en"]').isVisible(),true);}
   // Force lazy images to load and verify their saved bytes even when below fold.
   const failed=await page.evaluate(async()=>{const images=[...document.images];await Promise.all(images.map(img=>new Promise(r=>{img.loading='eager';if(img.complete)r();else{img.onload=r;img.onerror=r;}})));return images.filter(img=>!img.naturalWidth).map(img=>img.src);});assert.equal(failed.length,0,'Images loaded '+JSON.stringify(failed));
  }catch(e){report.offlineFailures.push({path,error:e.message});}
  checked++;if(checked%100===0)console.log(JSON.stringify({offlineChecked:checked,total:checkPages.length,failures:report.offlineFailures.length}));
 }
 await page.goto(base+basePath+'lessons/'+catalog.lessons[0].id+'/');await page.waitForFunction(()=>document.querySelector('[data-save-status]').textContent.includes('本包'));if((await page.locator('[data-complete]').textContent()).includes('已读完'))await page.locator('[data-complete]').click();await page.locator('[data-complete]').click();await page.reload();await page.waitForFunction(()=>document.querySelector('[data-complete]').textContent.includes('已读完'));assert.ok((await page.locator('[data-complete]').textContent()).includes('已读完'));await page.locator('[data-quiz] button[type="submit"]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-quiz-score]').textContent.includes('答对'));
 // Separate ZIP saving must work after going offline again.
 await page.waitForFunction(()=>document.querySelector('[data-save-status]').textContent.includes('本包'));await context.setOffline(false);await page.locator('[data-save-download]').click();await waitForBrowserCondition(page,async()=>Boolean(await(await caches.open('ai-from-scratch-downloads:v1')).match(new URL(document.querySelector('[data-save-download]').dataset.saveDownload,location.origin).href)),{timeout:180000});await page.waitForFunction(()=>!document.querySelector('[data-save-download]').disabled);await context.setOffline(true);assert.equal(await page.evaluate(async()=>{const r=await fetch(document.querySelector('[data-save-download]').dataset.saveDownload);return r.ok&&(await r.arrayBuffer()).byteLength>100;}),true);
 for(const route of ['/learn/ai-agent-book/','/learn/ai-engineering/','/learn/ai-toolkit/']){const r=await page.goto(base+route);assert.ok(r.ok());assert.ok((await page.content()).length>500);}
 const responsive=[basePath,basePath+'phases/'+catalog.phases[0].id+'/',basePath+'lessons/'+catalog.lessons.find(l=>l.phaseId==='01-math-foundations').id+'/',basePath+'projects/'+catalog.projects[0].id+'/'];
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});for(const path of responsive){await page.goto(base+path);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'Overflow '+width+' '+path);}report.widths.push(width);
  if(width===390)await page.screenshot({path:resolve(workspace,'mobile-project.png'),fullPage:true});
 }
 assert.equal(report.pageErrors.length,0);assert.equal(report.externalContentRequests.length,0);assert.equal(report.offlineFailures.length,0);
 await page.goto(base+'/learn/');await page.screenshot({path:resolve(workspace,'library.png'),fullPage:true});
}catch(e){report.pageErrors.push(e.message);console.log('REGISTRATIONS',await page.evaluate(async()=>({epoch:sessionStorage.getItem('ai-learning-document'),registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,activeUrl:r.active?.scriptURL,waiting:r.waiting?.state,installing:r.installing?.state}))})).catch(e=>e.message));if(process.env.AIFS_DEBUG)for(const worker of context.serviceWorkers())console.log('WORKER AFTER',await worker.evaluate(async()=>({keys:await caches.keys(),trace:self.__trace})).catch(e=>e.message));console.log(JSON.stringify({outstanding:[...outstanding],body:await page.locator('body').innerText({timeout:1000}).catch(()=>''),url:page.url()}));process.exitCode=1;}finally{await browser.close();server?.close();await writeFile(resolve(workspace,process.argv.includes('--base')?'verification-public.json':'verification-local.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
