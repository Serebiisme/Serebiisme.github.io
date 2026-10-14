import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditCredentialText} from '../scripts/from-scratch/security.mjs';
const path='content/ai-from-scratch/upstream/en/phases/14-agent-engineering/37-runtime-feedback-loops/code/main.py';
const fixture=await readFile(new URL('../'+path,import.meta.url),'utf8');
test('only the exact hash-verified public AWS sample fixture is resolved as a false positive',()=>{
 assert.equal(auditCredentialText({path,text:fixture,sourceFixture:fixture}).unapproved.length,0);
 assert.equal(auditCredentialText({path,text:fixture+'\n# modified',sourceFixture:fixture}).unapproved.length,1);
 assert.equal(auditCredentialText({path:'unknown.py',text:fixture,sourceFixture:fixture}).unapproved.length,1);
});
test('different credential-shaped strings fail regardless of example filename or fixture text',()=>{
 const key='AKIA'+'X'.repeat(16);
 assert.equal(auditCredentialText({path,text:fixture+'\n'+key,sourceFixture:fixture}).unapproved.length,2);
 assert.equal(auditCredentialText({path:'sample.py',text:key,sourceFixture:fixture}).unapproved.length,1);
});
