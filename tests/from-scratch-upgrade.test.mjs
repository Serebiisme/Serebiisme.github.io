import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLearningDocument,waitForWorkerActivation} from '../learn/offline-core.mjs';
class Storage{values=new Map([['existing-progress','keep']]);getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}}
test('an old controlled document refreshes once then becomes ready without touching progress',()=>{
 const storage=new Storage();
 assert.equal(prepareLearningDocument({storage,version:'v1',hadController:true}),'reload');
 assert.equal(prepareLearningDocument({storage,version:'v1',hadController:true}),'ready');
 assert.equal(prepareLearningDocument({storage,version:'v1',hadController:true}),'ready');
 assert.equal(storage.getItem('existing-progress'),'keep');
});
test('first install does not refresh and a later release refreshes exactly once',()=>{
 const storage=new Storage();assert.equal(prepareLearningDocument({storage,version:'v1',hadController:false}),'ready');
 assert.equal(prepareLearningDocument({storage,version:'v2',hadController:true}),'reload');
 assert.equal(prepareLearningDocument({storage,version:'v2',hadController:true}),'ready');
});
test('blocked session storage never starts an infinite refresh loop',()=>{
 assert.equal(prepareLearningDocument({storage:{getItem(){throw new Error('blocked');}},version:'v1',hadController:true}),'unsupported');
});
test('activation uses fresh registration state when a previous worker object stops delivering state changes',async()=>{
 const stale=new EventTarget();stale.state='installed';
 const task=waitForWorkerActivation({scope:'https://example.test/learn/',installing:stale},async()=>({active:{state:'activated'},installing:null,waiting:null}));
 try{assert.equal(await Promise.race([task.then(()=>true),new Promise(r=>setTimeout(()=>r(false),50))]),true);}finally{stale.state='activated';stale.dispatchEvent(new Event('statechange'));await task;}
});
test('a waiting worker is explicitly activated instead of leaving the reader in a permanent waiting state',async()=>{
 const current={active:{state:'activated'},waiting:{state:'installed',postMessage(message){if(message.type==='ACTIVATE_LEARNING_WORKER')current.waiting=null;}},installing:null};
 const task=waitForWorkerActivation({scope:'https://example.test/learn/'},async()=>current);
 try{assert.equal(await Promise.race([task.then(()=>true),new Promise(r=>setTimeout(()=>r(false),250))]),true);}finally{current.waiting=null;await task;}
});
