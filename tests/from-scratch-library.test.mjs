import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const courses=JSON.parse(await readFile(new URL('../learn/courses.json',import.meta.url),'utf8'));
test('learning library exposes new album without altering the existing three course routes',()=>{
 assert.equal(courses.length,4);assert.deepEqual(courses.slice(0,3).map(c=>c.route),['/learn/ai-agent-book/','/learn/ai-engineering/','/learn/ai-toolkit/']);
 const c=courses[3];assert.equal(c.route,'/learn/ai-from-scratch/');assert.equal(c.phaseCount,20);assert.equal(c.chapterCount,528);assert.equal(c.projectCount,76);assert.equal(c.autoCache,false);
});
