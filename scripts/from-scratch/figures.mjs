import {readFile,readdir,mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import {diagramKey} from './markdown.mjs';

export function collectDiagramBlocks(texts){
 const figures=new Set(),mermaids=new Set();
 for(const text of texts)for(const m of text.matchAll(/```(figure|mermaid)[ \t]*\n([\s\S]*?)```/g))(m[1]==='figure'?figures:mermaids).add(m[2].trim());
 return {figures:[...figures],mermaids:[...mermaids]};
}
export function compatibleMermaid(text){
  // Mermaid 12 parses unquoted @ as a link-id token; quoting labels keeps
  // the original text/edges while leaving the immutable source untouched.
  return text.replace(/([A-Za-z][\w]*)\[([^\]"\n]*@[^\]"\n]*)\]/g,(_,id,label)=>`${id}[${JSON.stringify(label)}]`);
}
export function validateProvider(code){
 const ast=parse(code,{ecmaVersion:'latest'});
 const deny=new Set(['fetch','XMLHttpRequest','WebSocket','EventSource','eval','Function','localStorage','sessionStorage','indexedDB','location','Worker','SharedWorker','importScripts']);
 function visit(node){if(!node||typeof node!=='object')return;if(node.type==='Identifier'&&deny.has(node.name))throw new Error('Unsafe drawing provider capability: '+node.name);if(node.type==='ImportExpression'||node.type==='ImportDeclaration')throw new Error('Unsafe drawing import');if(node.type==='MemberExpression'&&node.property?.name==='cookie')throw new Error('Unsafe cookie access');for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
 visit(ast);return true;
}

async function main(){
 const source=resolve('content/ai-from-scratch/upstream/en'),root=resolve('learn/ai-from-scratch');
 const catalog=JSON.parse(await readFile('content/ai-from-scratch/catalog.json','utf8'));
 const paths=[...catalog.lessons.flatMap(l=>[resolve(source,l.englishPath),resolve('content/ai-from-scratch/upstream/zh',l.draftPath)]),...catalog.projects.flatMap(p=>[p.readmePath,...p.stageDocPaths].map(f=>resolve(source,f)))];
 // Include reviewed editions too; exact blocks stay traceable to source.
 for(const r of JSON.parse(await readFile('content/ai-from-scratch/editorial.json','utf8')).records)if(r.status==='reviewed')paths.push(resolve('content/ai-from-scratch/editions',r.lessonId+'.md'));
 const blocks=collectDiagramBlocks(await Promise.all(paths.map(p=>readFile(p,'utf8'))));
 const providers=['lesson-figures.js','figures.js',...(await readdir(resolve(source,'site'))).filter(n=>/^figures-.+\.js$/.test(n)).sort(),'figures/projects/runtime.js',...(await readdir(resolve(source,'site/figures/projects'))).filter(n=>n.endsWith('.js')&&n!=='runtime.js').sort().map(n=>'figures/projects/'+n)];
 const scripts=[];for(const path of providers){const code=await readFile(resolve(source,'site',path),'utf8');validateProvider(code);scripts.push(code);}
 const playwright=await import(process.env.AIFS_PLAYWRIGHT_MODULE??'playwright');
 const browser=await playwright.chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:960,height:1100},reducedMotion:'reduce'});
 await context.route('**/*',route=>route.abort());
 const page=await context.newPage();const warnings=[];page.on('pageerror',e=>warnings.push(e.message));
 await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src \'none\'; form-action \'none\'"><style>:root{--bg:#f4f1ea;--ink:#181818;--blueprint:#395986;--blueprint-tint:#c7d6ee;--rule-soft:#ccc9c1;--font-body:Arial,sans-serif;--font-mono:monospace}body{margin:0;background:#f4f1ea;padding:24px}#capture{width:900px}svg{max-width:100%}button,input,select{font:inherit}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:5px}</style><div id="capture"></div>');
 for(const code of scripts)await page.addScriptTag({content:code});
 await page.addScriptTag({content:await readFile('node_modules/mermaid/dist/mermaid.min.js','utf8')});
 await page.evaluate(()=>mermaid.initialize({startOnLoad:false,securityLevel:'strict',flowchart:{htmlLabels:false},theme:'base',themeVariables:{primaryColor:'#d6e4bd',primaryTextColor:'#181818',lineColor:'#181818',fontFamily:'Arial',fontSize:'16px'}}));
 await mkdir(resolve(root,'figures'),{recursive:true});
 let map={};try{map=JSON.parse(await readFile(resolve(root,'figures.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let completed=0,failures=[];
 for(const [type,list]of [['figure',blocks.figures],['mermaid',blocks.mermaids]])for(const body of list){
  const key=type==='figure'?body:diagramKey(type,body),file=diagramKey(type,body)+'.png',path=resolve(root,'figures',file);
  if(map[key])try{if((await stat(path)).size>500){completed++;continue;}}catch{}
  try{
   const check=await page.evaluate(async({type,body})=>{
    window.AIFSFigureRuntime?.disposeRoot(document.querySelector('#capture'));
    const root=document.querySelector('#capture');root.replaceChildren();
    if(type==='figure'){
     const host=document.createElement('div');host.className='lesson-figure';host.dataset.figure=body;root.append(host);await window.mountLessonFigures(root);
     if(!host.childElementCount||host.dataset.figureMissing)throw new Error('Unknown or empty figure: '+body);
    }else{const {svg}=await mermaid.render('diagram'+Math.random().toString(36).slice(2),body);root.innerHTML=svg;}
    for(const svg of root.querySelectorAll('svg')){svg.setCurrentTime?.(3);svg.pauseAnimations?.();}
    return {text:root.textContent?.trim().length,graphics:root.querySelectorAll('svg,canvas').length};
   },{type,body:type==='mermaid'?compatibleMermaid(body):body});
   if(!check.text&&!check.graphics)throw new Error('Blank figure');
   await page.locator('#capture').screenshot({path,animations:'disabled',timeout:15000});
   map[key]='/learn/ai-from-scratch/figures/'+file;
  }catch(e){failures.push({type,key,error:e.message});}
  completed++;if(completed%50===0){await writeFile(resolve(root,'figures.json'),JSON.stringify(map));console.log(JSON.stringify({completed,total:blocks.figures.length+blocks.mermaids.length,failures:failures.length}));}
 }
 await writeFile(resolve(root,'figures.json'),JSON.stringify(map));
 await writeFile(resolve(root,'figures-report.json'),JSON.stringify({figures:blocks.figures.length,mermaids:blocks.mermaids.length,generated:Object.keys(map).length,failures,pageErrors:warnings}));
 await browser.close();console.log(JSON.stringify({figures:blocks.figures.length,mermaids:blocks.mermaids.length,failures,warnings}));if(failures.length||warnings.length)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
