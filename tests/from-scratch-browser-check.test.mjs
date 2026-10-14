import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Characterize the verifier boundary: a Promise resolving false must not pass.
import {waitForBrowserCondition} from '../scripts/from-scratch/browser-check.mjs';

test('browser verification rejects an asynchronous condition that never becomes true',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    await assert.rejects(waitForBrowserCondition(page,async()=>false,{timeout:100}),/Timeout/);
  }finally{await browser.close();}
});

test('browser verification waits for the resolved browser state, not its Promise',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    await page.evaluate(()=>{window.fixtureReady=false;setTimeout(()=>{window.fixtureReady=true;},200);});
    await waitForBrowserCondition(page,async()=>window.fixtureReady,{timeout:3000});
    assert.equal(await page.evaluate(()=>window.fixtureReady),true);
  }finally{await browser.close();}
});
