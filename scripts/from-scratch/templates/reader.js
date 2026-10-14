import {gradeQuiz,readProgress,filterLessons} from './reader-core.mjs';
import {getSavedPacks,prepareLearningDocument,waitForWorkerActivation,LEARNING_DOCUMENT_VERSION} from '/learn/offline-core.mjs';
const base='/learn/ai-from-scratch/';
const status=document.querySelector('[data-save-status]');
const show=text=>{if(status)status.textContent=text;};
let registry,search,registration;
const hadController=Boolean(navigator.serviceWorker?.controller);
const pending=new Map();
function storageRead(){try{return localStorage.getItem('aifs-progress:v1');}catch{return null;}}
function storageWrite(ids){try{localStorage.setItem('aifs-progress:v1',JSON.stringify([...ids]));}catch{show('无法保存本机阅读进度；阅读不受影响。');}}
async function saved(){return getSavedPacks({cachesApi:caches,packs:registry.packs,origin:location.origin});}
async function statusUpdate(){const ids=await saved(),pack=registry.packs.find(p=>p.id===document.body.dataset.pack);show(ids.has(pack?.id)?'本包已完整保存，可离线阅读':`本包未保存 · ${pack?(pack.bytes/1048576).toFixed(1):'?'} MB · 点击保存后可离线阅读`);}
function send(pack){
 if(pending.has(pack.id))return pending.get(pack.id).promise;
 let yes,no;const promise=new Promise((a,b)=>{yes=a;no=b;});
 const timer=setTimeout(()=>{pending.delete(pack.id);no(new Error('保存超时，可重试；已完成的旧版本仍保留。'));},15*60*1000);
 pending.set(pack.id,{promise,yes,no,timer});
 (registration.active??navigator.serviceWorker.controller).postMessage({type:'CACHE_COURSE',courseId:pack.id,manifestUrl:pack.manifestUrl});return promise;
}
async function savePack(id){const pack=registry.packs.find(p=>p.id===id);if(!pack)throw new Error('未知离线包');for(const dep of pack.dependencies)await savePack(dep);return send(pack);}
async function action(fn,button){if(button)button.disabled=true;try{await fn();await statusUpdate();}catch(e){show(`离线保存失败：${e.message}。可重试；浏览器可能空间不足，旧完整包未删除。`);}finally{if(button)button.disabled=false;}}
for(const button of document.querySelectorAll('[data-language]'))button.addEventListener('click',()=>{for(const article of document.querySelectorAll('[data-lang]'))article.hidden=article.dataset.lang!==button.dataset.language;for(const b of document.querySelectorAll('[data-language]'))b.setAttribute('aria-pressed',String(b===button));});
const complete=document.querySelector('[data-complete]');
const form=document.querySelector('[data-quiz]');
if(form)form.addEventListener('submit',async event=>{event.preventDefault();try{const response=await fetch('quiz.json');if(!response.ok)throw new Error('测验未保存');const questions=await response.json();const answers=questions.map((_,i)=>{const value=new FormData(form).get('q'+i);return value===null?undefined:Number(value);});const result=gradeQuiz({questions,answers});form.querySelector('[data-quiz-score]').textContent=`答对 ${result.correct} / ${result.total}`;result.feedback.forEach((f,i)=>form.querySelector(`[data-feedback="${i}"]`).textContent=`${f.correct?'正确':f.answered?'不正确':'未作答'} · 正确选项 ${f.answer+1} · ${f.explanation}`);}catch{form.querySelector('[data-quiz-score]').textContent='测验不可用，请先保存本阶段。';}});
try{
 const responses=await Promise.all([fetch(base+'packs.json'),fetch(base+(document.querySelector('#search')?'search.json':'lesson-index.json'))]);
 if(responses.some(r=>!r.ok))throw new Error('目录不可用，请先联网保存共享阅读器');
 [registry,search]=await Promise.all(responses.map(r=>r.json()));
 let progress=readProgress(storageRead(),search.map(l=>l.id));
 if(complete){const update=()=>complete.textContent=progress.has(document.body.dataset.lesson)?'已读完 · 撤销':'标记读完';update();complete.addEventListener('click',()=>{const id=document.body.dataset.lesson;if(progress.has(id))progress.delete(id);else progress.add(id);storageWrite(progress);update();});}
 const input=document.querySelector('#search'),results=document.querySelector('[data-search-results]');
 if(input){const draw=()=>{results.replaceChildren();for(const l of filterLessons({lessons:search,query:input.value}).slice(0,100)){const p=document.createElement('p'),a=document.createElement('a');a.href=base+'lessons/'+l.id+'/';a.textContent=`${progress.has(l.id)?'✓ ':''}${l.titleZh} / ${l.titleEn} · ${l.status==='reviewed'?'已校订':'中文草稿'}`;p.append(a);results.append(p);}};input.addEventListener('input',draw);draw();document.querySelector('[data-progress-summary]').textContent=`本机已读 ${progress.size} / ${search.length} 课（仅此浏览器）`;}
 const total=document.querySelector('[data-total-size]');if(total)total.textContent=`约 ${(registry.packs.reduce((s,p)=>s+p.bytes,0)/1048576).toFixed(1)} MB，不含 ZIP`;
 if(!('serviceWorker'in navigator)||!('caches'in window))throw new Error('此浏览器不支持离线保存');
 navigator.serviceWorker.addEventListener('message',e=>{const m=e.data,p=pending.get(m.courseId);if(!p)return;if(m.type==='CACHE_PROGRESS')show(`正在保存 ${m.courseId}：${m.completed}/${m.total}`);if(m.type==='CACHE_READY'||m.type==='CACHE_ERROR'){clearTimeout(p.timer);pending.delete(m.courseId);if(m.type==='CACHE_READY')p.yes();else p.no(new Error(m.message??'下载失败'));}});
 registration=await navigator.serviceWorker.register('/learn/sw.js',{scope:'/learn/',type:'module',updateViaCache:'none'});await waitForWorkerActivation(registration);registration=await navigator.serviceWorker.ready;
 if(prepareLearningDocument({storage:sessionStorage,version:LEARNING_DOCUMENT_VERSION,hadController})==='reload'){location.reload();}
 else{
 await statusUpdate();
 const button=document.querySelector('[data-save]');button?.addEventListener('click',()=>action(()=>savePack(document.body.dataset.pack),button));
 const all=document.querySelector('[data-save-all]');all?.addEventListener('click',()=>action(async()=>{if(!confirm(`将保存 ${registry.packs.length} 个阅读包，约 ${(registry.packs.reduce((s,p)=>s+p.bytes,0)/1048576).toFixed(1)} MB。ZIP、模型、数据不包含在内。继续？`))return;for(const p of registry.packs)await send(p);},all));
 for(const b of document.querySelectorAll('[data-save-download]'))b.addEventListener('click',()=>action(async()=>{await savePack(document.body.dataset.pack);const url=new URL(b.dataset.saveDownload,location.origin);if(url.origin!==location.origin||!url.pathname.startsWith(base+'downloads/'))throw new Error('无效下载路径');const res=await fetch(url,{cache:'reload'});if(!res.ok)throw new Error('ZIP 下载失败');await(await caches.open('ai-from-scratch-downloads:v1')).put(url.href,res);show('ZIP 已单独保存，下载仍受浏览器缓存清理影响。');},b));
 }
}catch(e){show(`${e.message}。可继续阅读页面内容；离线保存未就绪。`);}
