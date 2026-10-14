import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLessonMarkdown } from '../scripts/from-scratch/markdown.mjs';

test('source HTML and dangerous protocols never become executable markup', () => {
  const result = renderLessonMarkdown({ markdown: '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[x](javascript:alert(1))\n\n```js\n<>&\n```', lessonId:'p/l', resolveLink:()=>null, figures:{} });
  assert.doesNotMatch(result.html, /<script|<img[^>]+onerror|href="javascript:/i);
  assert.match(result.html, /&lt;&gt;&amp;/);
});
test('local links rewrite and external links disclose network access', () => {
  const result = renderLessonMarkdown({markdown:'[next](../next/docs/en.md) [paper](https://example.com/paper)',lessonId:'p/l',resolveLink:()=>'/learn/ai-from-scratch/lessons/p/next/',figures:{}});
  assert.match(result.html,/href="\/learn\/ai-from-scratch\/lessons\/p\/next\/"/);
  assert.match(result.html,/需要联网/);
});
test('math is rendered and missing figures or Mermaid block a complete build', () => {
  const result=renderLessonMarkdown({markdown:'$x^2$\n\n```figure\nunknown\n```\n\n```mermaid\ngraph LR; A-->B\n```',lessonId:'p/l',resolveLink:()=>null,figures:{}});
  assert.match(result.html,/katex/);
  assert.equal(result.unresolved.length,2);
});
test('known diagrams have local images and alternative descriptions',()=>{
  const result=renderLessonMarkdown({markdown:'```figure\nlinear\n```',lessonId:'p/l',figures:{linear:'/learn/ai-from-scratch/figures/linear.png'},resolveLink:()=>null});
  assert.match(result.html,/alt="linear/);
  assert.equal(result.unresolved.length,0);
});
