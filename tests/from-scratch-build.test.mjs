import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir,writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildCourse} from '../scripts/from-scratch/build.mjs';
import {filterLessons} from '../scripts/from-scratch/reader-core.mjs';
test('builder emits bilingual pages truthful drafts original quiz code downloads and scoped packs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aifs-build-'));const sourceRoot=join(root,'source');const editionRoot=join(root,'editions');const outputRoot=join(root,'output');
 const files={'phases/00-basic/01-first/docs/en.md':'# First\n\nFull original lesson. BM25 is a lexical scorer.','phases/00-basic/01-first/docs/zh.md':'# 第一课\n\n完整中文草稿。','phases/00-basic/01-first/code/main.py':'print("<>&")','phases/00-basic/01-first/quiz.json':JSON.stringify([{question:'Q?',options:['yes','no'],correct:0,explanation:'E'}]),'LICENSE':'MIT fixture'};
 for(const [file,text]of Object.entries(files)){const path=join(sourceRoot,file);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,text);}
 const l={id:'00-basic/01-first',phaseId:'00-basic',slug:'01-first',titleZh:'第一课',titleEn:'First',englishPath:'phases/00-basic/01-first/docs/en.md',draftPath:'phases/00-basic/01-first/docs/zh.md',codePaths:['phases/00-basic/01-first/code/main.py'],outputPaths:[],quizPath:'phases/00-basic/01-first/quiz.json'};
 const catalog={phases:[{id:'00-basic',lessons:[l.id]}],lessons:[l],projects:[],quizzes:[{lessonId:l.id,path:l.quizPath}]};
 const report=await buildCourse({catalog,sourceRoot,translationRoot:sourceRoot,editionRoot,outputRoot,editorial:{records:[]},sourceCommit:'abc',figures:{}});
 assert.equal(report.lessonPages,1);assert.equal(report.quizCount,1);assert.deepEqual(report.unresolved,[]);
 const search=JSON.parse(await readFile(join(outputRoot,'search.json'),'utf8'));
 assert.deepEqual(filterLessons({lessons:search,query:'BM25'}).map(l=>l.id),['00-basic/01-first']);
 assert.deepEqual(filterLessons({lessons:search,query:'环境与工具'}).map(l=>l.id),['00-basic/01-first']);
 const html=await readFile(join(outputRoot,'lessons',l.id,'index.html'),'utf8');
 assert.match(html,/中文草稿/);assert.match(html,/完整中文草稿/);assert.match(html,/Full original lesson/);assert.match(html,/运行未验证/);assert.match(html,/\/notes\//);
 const quiz=JSON.parse(await readFile(join(outputRoot,'lessons',l.id,'quiz.json'),'utf8'));assert.equal(quiz[0].correct,0);
 const packs=JSON.parse(await readFile(join(outputRoot,'packs.json'),'utf8')).packs;
 assert.equal(packs.length,2);assert.deepEqual(packs[1].dependencies,['ai-from-scratch']);
 for(const pack of packs){const m=JSON.parse(await readFile(join(outputRoot,pack.manifestUrl.split('/learn/ai-from-scratch/')[1]),'utf8'));let bytes=0;for(const path of m.assets)bytes+=(await readFile(join(outputRoot,path.split('/learn/ai-from-scratch/')[1]))).length;assert.equal(pack.bytes,bytes,'pack size includes the actual registry bytes');}
 const manifest=JSON.parse(await readFile(join(outputRoot,packs[1].manifestUrl.split('/learn/ai-from-scratch/')[1]),'utf8'));
 assert.ok(manifest.assets.some(a=>a.endsWith('/quiz.json')));assert.ok(manifest.assets.every(a=>!a.endsWith('.zip')));
});
