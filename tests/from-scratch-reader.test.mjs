import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuiz, readProgress, filterLessons } from '../scripts/from-scratch/reader-core.mjs';
test('quiz grading handles correct incorrect and unanswered without changing options',()=>{
 const questions=[{question:'one',options:['a','b'],correct:1,explanation:'why'},{question:'two',options:['c','d'],correct:0},{question:'three',options:['e','f'],correct:0}];
 const r=gradeQuiz({questions,answers:[1,1]}); assert.equal(r.correct,1);assert.equal(r.total,3);assert.deepEqual(r.feedback.map(x=>x.correct),[true,false,false]);assert.equal(r.feedback[2].answered,false);assert.deepEqual(questions[0].options,['a','b']);
});
test('corrupt or invalid progress is ignored and unknown ids removed',()=>{
 for(const raw of ['bad','{}','null','42'])assert.deepEqual([...readProgress(raw,['a','b'])],[]);
 assert.deepEqual([...readProgress('["a","a","other",3]',['a','b'])],['a']);
});
test('search handles Chinese English core terms and whitespace',()=>{
 const lessons=[{id:'p/rag',titleZh:'检索增强生成',titleEn:'Retrieval augmented generation',terms:'BM25 向量'},{id:'p/math',titleZh:'数学',titleEn:'Math'}];
 for(const query of ['检索','retrieval','bm25'])assert.deepEqual(filterLessons({lessons,query}).map(x=>x.id),['p/rag']);
 assert.equal(filterLessons({lessons,query:'   '}).length,2);
});
