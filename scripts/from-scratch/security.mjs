import {createHash} from 'node:crypto';
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
const sourcePath='phases/14-agent-engineering/37-runtime-feedback-loops/code/main.py';
const fixturePath='content/ai-from-scratch/upstream/en/'+sourcePath;
const fixtureHash='f145730b32c35f47fcc96742115ed2e56ccb1865a66179b825cd443b22ad9b47';
const knownExample='AKIA'+'IOSFODNN7EXAMPLE';
const digest=t=>createHash('sha256').update(t).digest('hex');
const pattern=()=>/gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN( [A-Z]+)? PRIVATE KEY-----|sk-(?:proj|ant)-[A-Za-z0-9_-]{20,}/g;
const escape=t=>t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function auditCredentialText({path,text,sourceFixture}){
 const matches=[...text.matchAll(pattern())];const result={resolved:[],unapproved:[]};
 const exactSource=digest(sourceFixture)===fixtureHash;
 const isPlain=[fixturePath,'learn/ai-from-scratch/files/'+sourcePath].includes(path);
 const isZip=path==='learn/ai-from-scratch/downloads/lesson-14-agent-engineering--37-runtime-feedback-loops.zip:'+sourcePath;
 const isDisplay=path==='learn/ai-from-scratch/lessons/14-agent-engineering/37-runtime-feedback-loops/index.html';
 const validated=exactSource&&((isPlain||isZip)?digest(text)===fixtureHash:isDisplay&&text.includes(escape(sourceFixture)));
 for(const match of matches)(validated&&match[0]===knownExample?result.resolved:result.unapproved).push({path,offset:match.index,type:match[0].startsWith('AKIA')?'AWS identifier':'credential pattern'});
 return result;
}
async function main(){
 const root=resolve(process.argv[2]??'.'),sourceFixture=await readFile(resolve(root,fixturePath),'utf8');
 const report={bytes:0,files:0,archives:0,resolved:[],unapproved:[],reference:'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html'};
 async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['.git','node_modules','.superpowers','.worktrees'].includes(e.name))continue;const path=resolve(dir,e.name),name=relative(root,path);if(e.isSymbolicLink())throw new Error('Publication symlink '+name);if(e.isDirectory())await visit(path);else if(e.isFile()){
  const data=await readFile(path);report.files++;report.bytes+=data.length;
  function check(name,text){const r=auditCredentialText({path:name,text,sourceFixture});report.resolved.push(...r.resolved);report.unapproved.push(...r.unapproved);}
  check(name,data.toString('utf8'));
  if(name.endsWith('.zip')){report.archives++;for(const [entry,bytes]of Object.entries(unzipSync(new Uint8Array(data))))check(name+':'+entry,new TextDecoder().decode(bytes));}
 }}}
 await visit(root);if(report.bytes>1073741824)throw new Error('Publication exceeds 1 GiB');await stat(resolve(root,'index.html'));console.log(JSON.stringify(report));if(report.unapproved.length)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
