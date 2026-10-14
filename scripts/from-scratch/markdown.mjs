import MarkdownIt from 'markdown-it';
import katex from 'katex';
import {createHash} from 'node:crypto';

export const diagramKey=(type,body)=>`${type}-${createHash('sha256').update(body.trim()).digest('hex').slice(0,20)}`;
export function renderLessonMarkdown({markdown,lessonId,resolveLink=()=>null,figures={}}) {
  const assets=new Set(), unresolved=[];
  const md=new MarkdownIt({html:false,linkify:false,typographer:false});
  const esc=md.utils.escapeHtml;
  md.inline.ruler.before('escape','math', (state,silent)=>{
    const start=state.pos, tail=state.src.slice(start);
    const match=tail.match(/^\$([^$\n]+)\$/)||tail.match(/^\\\(([^\n]*?)\\\)/);
    if(!match)return false;
    if(!silent){const t=state.push('math','',0);t.content=match[1];}state.pos+=match[0].length;return true;
  });
  md.renderer.rules.math=(tokens,i)=>katex.renderToString(tokens[i].content,{throwOnError:false,trust:false,strict:'ignore'});
  md.block.ruler.before('fence','math_block',(state,startLine,endLine,silent)=>{
    const start=state.bMarks[startLine]+state.tShift[startLine];const tail=state.src.slice(start);
    const match=tail.match(/^\$\$([\s\S]*?)\$\$/)||tail.match(/^\\\[([\s\S]*?)\\\]/);
    if(!match)return false;if(silent)return true;
    const t=state.push('math_block','',0);t.content=match[1];t.block=true;
    state.line=startLine+match[0].split('\n').length;return true;
  });
  md.renderer.rules.math_block=(tokens,i)=>`<div class="math">${katex.renderToString(tokens[i].content,{displayMode:true,throwOnError:false,trust:false,strict:'ignore'})}</div>`;
  const fence=md.renderer.rules.fence;
  md.renderer.rules.fence=(tokens,i,opts,env,self)=>{
    const type=tokens[i].info.trim(), body=tokens[i].content.trim();
    if(!['figure','mermaid'].includes(type))return fence(tokens,i,opts,env,self);
    const key=type==='figure'?body:diagramKey(type,body), url=figures[key];
    if(!url||!url.startsWith('/learn/ai-from-scratch/')){unresolved.push({lessonId,type,key});return `<pre class="diagram-missing">${esc(body)}</pre>`;}
    assets.add(url);
    return `<figure><img src="${esc(url)}" alt="${esc(type==='figure'?body.split(/\s/)[0]:'原课流程图')} 图解" loading="lazy"><figcaption>${type==='figure'?'原交互图的默认状态静态快照，滑块与动画不包含在本离线图中。':'原课 Mermaid 图 · 本地静态渲染'}</figcaption></figure>`;
  };
  md.renderer.rules.link_open=(tokens,i,opts,env,self)=>{
    const original=tokens[i].attrGet('href');
    if(/^https?:\/\//i.test(original)){tokens[i].attrSet('rel','noreferrer');tokens[i].attrSet('data-network','true');}
    else if(!original.startsWith('#')){
      const mapped=resolveLink(original,false);
      if(mapped)tokens[i].attrSet('href',mapped);else {tokens[i].attrSet('href',`https://github.com/rohitg00/ai-engineering-from-scratch/blob/f0c979b98d35f0547fe7a5f9aadf2f25d6c2e375/${encodeURI(original)}`);tokens[i].attrSet('data-network','true');}
    }
    return self.renderToken(tokens,i,opts);
  };
  md.renderer.rules.link_close=(tokens,i,opts,env,self)=>{
    let opening=i-1;while(opening>=0&&tokens[opening].type!=='link_open')opening--;
    return `${opening>=0&&tokens[opening].attrGet('data-network')?' <small>↗ 需要联网</small>':''}${self.renderToken(tokens,i,opts)}`;
  };
  md.renderer.rules.image=(tokens,i)=>{
    const t=tokens[i], original=t.attrGet('src'), alt=t.content;
    if(/^https?:\/\//i.test(original))return `<a href="${esc(original)}" rel="noreferrer">${esc(alt||'外部配图')} ↗ 需要联网（未镜像）</a>`;
    const mapped=resolveLink(original,true);
    if(!mapped?.startsWith('/learn/ai-from-scratch/')){unresolved.push({lessonId,type:'image',key:original});return `<span>未找到配图 ${esc(alt)}</span>`;}
    assets.add(mapped);return `<img src="${esc(mapped)}" alt="${esc(alt||'原课配图')}" loading="lazy">`;
  };
  return {html:md.render(markdown),referencedAssets:[...assets],unresolved};
}
