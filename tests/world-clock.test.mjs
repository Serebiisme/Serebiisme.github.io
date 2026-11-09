import test from 'node:test';
import assert from 'node:assert/strict';
import {clockAt,parseBeijingInput,beijingInput,restoreCities} from '../world-clock/clock-core.mjs';

test('one instant gives correct Beijing, previous-year Los Angeles and next-day Pacific dates',()=>{
 const t=Date.parse('2026-01-01T01:00:00Z');
 assert.equal(clockAt(t,'Asia/Shanghai').time,'09:00:00');
 const la=clockAt(t,'America/Los_Angeles');
 assert.equal(la.dateKey,'2025-12-31');assert.equal(la.time,'17:00:00');assert.equal(la.dayDelta,-1);assert.equal(la.diffMinutes,-960);
 assert.equal(clockAt(Date.parse('2026-01-01T16:30:00Z'),'Pacific/Kiritimati').dayDelta,0);
 assert.equal(clockAt(Date.parse('2026-01-01T15:30:00Z'),'Pacific/Kiritimati').dayDelta,1);
});
test('US spring forward and autumn repeated hour use the offset at the selected instant',()=>{
 const cases=[['2026-03-08T06:59:00Z','01:59:00',-300],['2026-03-08T07:00:00Z','03:00:00',-240],['2026-11-01T05:30:00Z','01:30:00',-240],['2026-11-01T06:30:00Z','01:30:00',-300]];
 for(const [date,time,offset]of cases){const c=clockAt(Date.parse(date),'America/New_York');assert.equal(c.time,time);assert.equal(c.offsetMinutes,offset);}
});
test('UK DST, southern summer and non-whole-hour offsets are preserved',()=>{
 assert.equal(clockAt(Date.parse('2026-03-29T00:59:00Z'),'Europe/London').offsetMinutes,0);
 assert.equal(clockAt(Date.parse('2026-03-29T01:00:00Z'),'Europe/London').offsetMinutes,60);
 assert.equal(clockAt(Date.parse('2026-01-01T00:00:00Z'),'Australia/Sydney').offsetMinutes,660);
 assert.equal(clockAt(Date.parse('2026-07-01T00:00:00Z'),'Australia/Sydney').offsetMinutes,600);
 const ktm=clockAt(Date.parse('2026-11-09T00:00:00Z'),'Asia/Kathmandu');assert.equal(ktm.time,'05:45:00');assert.equal(ktm.diffMinutes,-135);assert.equal(ktm.offsetLabel,'UTC+05:45');
 assert.equal(clockAt(Date.parse('2026-11-09T00:00:00Z'),'Asia/Kolkata').diffMinutes,-150);
});
test('Beijing input is independent of device zone, rejects rollover and supports leap days',()=>{
 assert.equal(parseBeijingInput('2026-11-09T08:30'),Date.parse('2026-11-09T00:30:00Z'));
 assert.equal(beijingInput(Date.parse('2026-11-09T00:30:17Z')),'2026-11-09T08:30');
 assert.equal(parseBeijingInput('2000-02-29T00:00'),Date.parse('2000-02-28T16:00:00Z'));
 for(const value of ['',null,'2026-02-30T08:00','2026-11-09T24:00','1999-12-31T23:59','2100-01-01T00:00','2026-11-09T08:00Z'])assert.equal(parseBeijingInput(value),null);
 assert.throws(()=>clockAt(NaN,'Asia/Shanghai'));assert.throws(()=>clockAt(0,'Invalid/Zone'));
});
test('preference restoration keeps intentional empty lists and rejects malformed or unknown entries',()=>{
 const catalog=[{id:'london'},{id:'tokyo'}],defaults=['tokyo'];
 assert.deepEqual(restoreCities(null,catalog,defaults),defaults);assert.deepEqual(restoreCities('{oops',catalog,defaults),defaults);
 assert.deepEqual(restoreCities('[]',catalog,defaults),[]);
 assert.deepEqual(restoreCities('["london","london","__proto__",{},null]',catalog,defaults),['london']);
 assert.deepEqual(restoreCities('{"ids":["london"]}',catalog,defaults),defaults);
});
