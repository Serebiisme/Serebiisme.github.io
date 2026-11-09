import {clockAt,parseBeijingInput,beijingInput,restoreCities} from './clock-core.mjs';
import {cityCatalog,DEFAULT_CITIES} from './cities.mjs';
const $=s=>document.querySelector(s);
const catalog=cityCatalog(),byId=new Map(catalog.map(c=>[c.id,c]));
const key='world-clock:cities:v1';let raw=null;
try{raw=localStorage.getItem(key);}catch{}
let selected=restoreCities(raw,catalog,DEFAULT_CITIES.filter(id=>byId.has(id)));
let live=true,instant=Date.now(),timer;
const palette=['#d6e3bc','#ded4ee','#f8e6a9','#f3c8bb','#c7d6ee','#e9e3d9'];
const cards=new Map();
const announce=text=>{$('#status').textContent=text;};
function save(){try{localStorage.setItem(key,JSON.stringify(selected));return true;}catch{announce('当前选择未能保存到本机；本次仍可正常使用。');return false;}}
function redrawCards(){
 const fragment=document.createDocumentFragment();cards.clear();
 for(const id of selected){
  const city=byId.get(id);if(!city)continue;
  const card=$('#city-template').content.firstElementChild.cloneNode(true);card.dataset.cityId=id;
  card.style.background=palette[[...city.zone].reduce((n,c)=>n+c.charCodeAt(0),0)%palette.length];
  card.querySelector('[data-name]').textContent=city.name;card.querySelector('[data-english]').textContent=city.english;
  const remove=card.querySelector('.remove-city');remove.setAttribute('aria-label',`移除${city.name}`);remove.addEventListener('click',()=>{selected=selected.filter(x=>x!==id);if(save())announce(`已移除${city.name}。`);redrawCards();render();$('#add-city').focus();});
  cards.set(id,card);fragment.append(card);
 }
 $('#city-grid').replaceChildren(fragment);$('#empty-state').hidden=selected.length>0;$('#city-count').textContent=`${selected.length} 座城市`;
}
function render(){
 if(live)instant=Date.now();
 const b=clockAt(instant,'Asia/Shanghai');
 $('#beijing-time').textContent=b.time;$('#beijing-time').dateTime=new Date(instant).toISOString();
 $('#beijing-date').textContent=`${b.dateKey.replaceAll('-','.')} ${b.weekday}`;
 $('#beijing-period').textContent=b.period;$('#mode-label').lastChild.textContent=live?'实时同步':'时间换算';$('#mode-label').classList.toggle('is-fixed',!live);
 $('#live-button').setAttribute('aria-pressed',String(live));$('#selection-label').textContent=live?'也可以看看未来':'所有城市同步换算';
 $('#hour-hand').setAttribute('transform',`rotate(${(b.hour%12)*30+b.minute/2},60,60)`);$('#minute-hand').setAttribute('transform',`rotate(${b.minute*6+b.second/10},60,60)`);
 if(document.activeElement!==$('#reference-time')&&!$('#time-error').textContent)$('#reference-time').value=beijingInput(instant);
 if(document.activeElement!==$('#time-slider'))$('#time-slider').value=b.minuteOfDay;
 $('#slider-label').textContent=b.time.slice(0,5);$('#time-slider').setAttribute('aria-valuetext',`北京时间 ${b.time.slice(0,5)}`);
 for(const [id,card]of cards){
  const c=clockAt(instant,byId.get(id).zone);const time=card.querySelector('[data-time]');time.textContent=c.time.slice(0,5);time.dateTime=new Date(instant).toISOString();
  card.querySelector('[data-date]').textContent=`${c.date} ${c.weekday}`;
  const day=card.querySelector('[data-day]');day.textContent=c.dayLabel;day.classList.toggle('same-day',c.dayDelta===0);
  card.querySelector('[data-period]').textContent=c.period;card.querySelector('[data-diff]').textContent=c.diffLabel;card.querySelector('[data-offset]').textContent=c.offsetLabel;
  card.querySelector('.time-position').style.left=`${c.minuteOfDay/1440*100}%`;card.querySelector('.day-track').setAttribute('aria-label',`${byId.get(id).name}当地 ${c.time.slice(0,5)}，轨道表示一天 24 小时的位置`);
 }
}
function choose(value){
 const ms=parseBeijingInput(value);
 if(ms===null){$('#time-error').textContent='未应用：请选择 2000–2099 年之间有效的北京时间，或点击“回到现在”。';$('#reference-time').setAttribute('aria-invalid','true');return;}
 $('#time-error').textContent='';$('#reference-time').removeAttribute('aria-invalid');live=false;instant=ms;render();
}
$('#reference-time').addEventListener('change',e=>choose(e.target.value));
$('#time-slider').addEventListener('input',e=>{const date=beijingInput(instant).slice(0,10),m=Number(e.target.value);choose(`${date}T${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);});
$('#live-button').addEventListener('click',()=>{live=true;$('#time-error').textContent='';$('#reference-time').removeAttribute('aria-invalid');render();announce('已回到现在，所有城市实时同步。');});
function drawOptions(){
 const query=$('#city-search').value.trim().toLocaleLowerCase();
 const matches=catalog.filter(c=>!query?!c.id.startsWith('zone:'):`${c.name} ${c.english} ${c.country} ${c.zone}`.toLocaleLowerCase().includes(query));
 $('#search-summary').textContent=matches.length?`找到 ${matches.length} 个城市或时区${matches.length>60?'，显示前 60 项，请继续输入缩小范围':''}。`:'没有找到匹配项，试试中文、英文或 Europe/Paris。';
 const fragment=document.createDocumentFragment();
 for(const city of matches.slice(0,60)){
  const button=document.createElement('button');button.type='button';button.className='city-option';button.dataset.addId=city.id;
  const copy=document.createElement('span'),name=document.createElement('strong'),meta=document.createElement('small'),action=document.createElement('span');
  name.textContent=`${city.name} ${city.english===city.name?'':city.english}`;meta.textContent=`${city.country} / ${city.zone}`;copy.append(name,meta);action.textContent=selected.includes(city.id)?'已添加':'＋ 添加';button.disabled=selected.includes(city.id);button.append(copy,action);
  button.addEventListener('click',()=>{if(selected.length>=24){$('#search-summary').textContent='最多对照 24 个城市，请先移除一个城市。';return;}selected.push(city.id);if(save())announce(`已添加${city.name}，城市选择已保存在本机。`);redrawCards();render();$('#city-dialog').close();});
  fragment.append(button);
 }
 $('#city-results').replaceChildren(fragment);
}
$('#add-city').addEventListener('click',()=>{$('#city-search').value='';drawOptions();$('#city-dialog').showModal();$('#city-search').focus();});
$('#city-search').addEventListener('input',drawOptions);
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>document.getElementById(button.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog')){
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close();}});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
}
$('#copy-times').addEventListener('click',async()=>{
 const at=live?Date.now():instant,b=clockAt(at,'Asia/Shanghai');const text=[`世界时间对照（同一时刻）`,`北京 ${b.dateKey} ${b.time} ${b.offsetLabel}`,...selected.map(id=>{const city=byId.get(id),c=clockAt(at,city.zone);return `${city.name} ${c.dateKey} ${c.time} ${c.offsetLabel}（${c.diffLabel}）`;})].join('\n');
 try{if(!navigator.clipboard?.writeText)throw new Error('Unavailable');await navigator.clipboard.writeText(text);announce('时间表已复制。');}catch{$('#copy-text').value=text;$('#copy-dialog').showModal();$('#copy-text').focus();$('#copy-text').select();}
});
redrawCards();render();document.body.dataset.ready='true';
timer=setInterval(()=>{if(live&&!document.hidden)render();},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
window.addEventListener('pageshow',()=>render());
