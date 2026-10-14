import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDiagramBlocks,validateProvider,compatibleMermaid} from '../scripts/from-scratch/figures.mjs';
test('diagram collection deduplicates exact figure configs but not distinct variants',()=>{
 const r=collectDiagramBlocks(['```figure\na {"n":1}\n```\n```mermaid\ngraph LR; A-->B\n```','```figure\na {"n":1}\n```\n```figure\na {"n":2}\n```']);assert.equal(r.figures.length,2);assert.equal(r.mermaids.length,1);
});
test('Mermaid node labels with at signs are quoted without changing their meaning',()=>{
 assert.equal(compatibleMermaid('flowchart LR\n A --> Eval[Recall@k vs Gold Spans]'),'flowchart LR\n A --> Eval["Recall@k vs Gold Spans"]');
});
test('drawing providers with network storage or dynamic code are rejected before browser evaluation',()=>{
 for(const code of ['fetch("https://evil")','localStorage.setItem("x","y")','eval("x")','new Function("x")'])assert.throws(()=>validateProvider(code),/Unsafe/);
 assert.doesNotThrow(()=>validateProvider('LF.register({"safe": function(h){h.append(document.createElement("svg"))}})'));
});
