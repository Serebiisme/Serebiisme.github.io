import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const MODULES = [
  ['LLM Fundamentals', 'llm', '大模型基础'],
  ['Prompt Engineering', 'prompt', '提示词工程'],
  ['Retrieval-Augmented Generation (RAG)', 'rag', '检索增强生成'],
  ['AI Agents and Agentic Systems', 'agents', '智能体与 Agent 系统'],
  ['Fine-Tuning and Model Adaptation', 'finetuning', '微调与模型适配'],
  ['Vector Databases and Embeddings', 'embeddings', '向量数据库与嵌入'],
  ['AI System Design', 'design', 'AI 系统设计'],
  ['LLMOps and Production AI', 'llmops', '大模型生产与运维'],
  ['Evaluation and Testing', 'evaluation', '评估与测试'],
  ['AI Safety, Ethics, and Responsible AI', 'safety', '安全、伦理与负责任 AI'],
  ['Multimodal AI', 'multimodal', '多模态 AI'],
  ['AI Infrastructure and Scalability', 'infrastructure', '基础设施与扩展'],
  ['Coding and Practical Implementation', 'coding', '编码与实践'],
  ['Behavioral and Scenario-Based Questions', 'behavioral', '行为与情境面试'],
];

export function parseBank(markdown) {
  const modules = MODULES.map(([originalTitle, id, title]) => ({ id, title, originalTitle, questions: [] }));
  let current;
  let question;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('### ')) {
      current = modules.find((module) => module.originalTitle === line.slice(4).trim());
      question = undefined;
    } else if (current && line.startsWith('- ')) {
      question = { id: `${current.id}-${String(current.questions.length + 1).padStart(3, '0')}`, original: line.slice(2).trim(), sources: [] };
      current.questions.push(question);
    } else if (question && /^\s+- Answer:/.test(line)) {
      for (const match of line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)) {
        question.sources.push({ title: match[1], url: match[2] });
      }
    }
  }
  return modules;
}

const sourceDir = process.argv[2];
if (sourceDir) {
  const sourceCommit = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: sourceDir, encoding: 'utf8' }).trim();
  const readme = execFileSync('git', ['show', `${sourceCommit}:README.md`], { cwd: sourceDir, encoding: 'utf8' });
  const license = execFileSync('git', ['show', `${sourceCommit}:LICENSE`], { cwd: sourceDir, encoding: 'utf8' });
  const modules = parseBank(readme);
  const articles = [...new Map(modules.flatMap((module) => module.questions.flatMap((q) => q.sources))
    .filter((source) => /outcomeschool\.com\/blog\/|outcomeschool\.substack\.com\/p\//.test(source.url))
    .map((source) => [source.url, source])).values()];
  const root = resolve('learn/ai-engineering');
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, 'bank.json'), JSON.stringify({ sourceCommit, sourceRepository: 'https://github.com/amitshekhariitbhu/ai-engineering-interview-questions', checkedAt: '2026-10-13', modules, articles }, null, 2) + '\n');
  await writeFile(resolve(root, 'LICENSE.txt'), license);
  await writeFile(resolve(root, 'upstream-README.md'), readme);
  console.log(JSON.stringify({ sourceCommit, modules: modules.map((m) => [m.id, m.questions.length]), questions: modules.reduce((n, m) => n + m.questions.length, 0), articles: articles.length }));
}
