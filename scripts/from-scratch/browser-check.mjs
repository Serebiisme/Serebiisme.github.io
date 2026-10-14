// Await the browser's resolved value explicitly. Do not poll a Promise handle.
export async function waitForBrowserCondition(page,predicate,{timeout=30000}={}) {
  const deadline=Date.now()+timeout;
  do {
    if(await page.evaluate(predicate)===true)return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }while(Date.now()<deadline);
  throw new Error(`Timeout ${timeout}ms waiting for browser condition`);
}
