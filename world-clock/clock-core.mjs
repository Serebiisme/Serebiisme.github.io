const formatters=new Map();
const pad=n=>String(n).padStart(2,'0');
function partsAt(ms,zone){
 if(!Number.isFinite(ms)||Math.abs(ms)>8.64e15)throw new RangeError('Invalid instant');
 if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('zh-CN',{timeZone:zone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
 return Object.fromEntries(formatters.get(zone).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function clockAt(ms,zone){
 const p=partsAt(ms,zone),b=partsAt(ms,'Asia/Shanghai');
 const hour=Number(p.hour),minute=Number(p.minute),second=Number(p.second);
 const dateKey=`${p.year}-${p.month}-${p.day}`;
 const localUTC=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),hour,minute,second);
 const offsetMinutes=Math.round((localUTC-Math.floor(ms/1000)*1000)/60000);
 const bOffset=Math.round((Date.UTC(Number(b.year),Number(b.month)-1,Number(b.day),Number(b.hour),Number(b.minute),Number(b.second))-Math.floor(ms/1000)*1000)/60000);
 const dayDelta=Math.round((Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))-Date.UTC(Number(b.year),Number(b.month)-1,Number(b.day)))/86400000);
 const diffMinutes=offsetMinutes-bOffset,absolute=Math.abs(diffMinutes);
 const diffLabel=diffMinutes===0?'与北京同时':`比北京${diffMinutes>0?'快':'慢'} ${Math.floor(absolute/60)?`${Math.floor(absolute/60)} 小时`:''}${absolute%60?` ${absolute%60} 分钟`:''}`.replace(/\s+/g,' ');
 return {dateKey,date:`${Number(p.month)}月${Number(p.day)}日`,weekday:p.weekday,hour,minute,second,time:`${pad(hour)}:${pad(minute)}:${pad(second)}`,offsetMinutes,offsetLabel:`UTC${offsetMinutes>=0?'+':'-'}${pad(Math.floor(Math.abs(offsetMinutes)/60))}:${pad(Math.abs(offsetMinutes)%60)}`,diffMinutes,diffLabel,dayDelta,dayLabel:dayDelta<0?'前一天':dayDelta>0?'后一天':'同一天',period:hour<6?'深夜':hour<12?'上午':hour<18?'午后':hour<22?'晚间':'深夜',minuteOfDay:hour*60+minute};
}
export function beijingInput(ms){const c=clockAt(ms,'Asia/Shanghai');return `${c.dateKey}T${c.time.slice(0,5)}`;}
export function parseBeijingInput(value){
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
 const ms=Date.parse(`${value}:00+08:00`);
 return Number.isFinite(ms)&&beijingInput(ms)===value?ms:null;
}
export function restoreCities(raw,catalog,defaults){
 try{if(raw===null)return [...defaults];const ids=JSON.parse(raw);if(!Array.isArray(ids))return [...defaults];const valid=new Set(catalog.map(c=>c.id));return [...new Set(ids.filter(id=>typeof id==='string'&&valid.has(id)))].slice(0,24);}catch{return [...defaults];}
}
