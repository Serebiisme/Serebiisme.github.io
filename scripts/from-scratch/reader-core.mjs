export function gradeQuiz({questions, answers}) {
  const feedback=questions.map((q,i)=>({correct:answers[i]===q.correct, answered:Number.isInteger(answers[i]), answer:q.correct, explanation:q.explanation??''}));
  return {correct:feedback.filter(x=>x.correct).length,total:questions.length,feedback};
}
export function readProgress(raw,validIds) {
  try { const data=JSON.parse(raw);const valid=new Set(validIds);return new Set(Array.isArray(data)?data.filter(id=>typeof id==='string'&&valid.has(id)):[]); } catch {return new Set();}
}
export function filterLessons({lessons,query}) {
  const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return lessons.filter(l=>words.every(w=>[l.titleZh,l.titleEn,l.id,l.terms].join(' ').toLowerCase().includes(w)));
}
