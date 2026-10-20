import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResourceChart,resourceChartPoint,resourceChartY} from '../src/management/resource-chart.ts';
import type {SystemSample} from '../src/management/system-health.ts';
const base=Date.parse('2026-10-20T01:00:00Z');
const sample=(minutes:number,cpu:number|null=10,memory:number|null=50):SystemSample=>({observedAt:new Date(base+minutes*60000).toISOString(),cpu,memory:memory===null?null:{used:memory,total:100,rate:memory},status:'healthy',disk:null,connections:null,databaseBytes:null,bootAt:null});

test('hover selects actual plotted averages and preserves zero and missing series without crossing gaps',()=>{
 const chart=buildResourceChart([sample(0,0,20),sample(1,null,60),sample(10,30,80)]);
 assert.equal(resourceChartPoint(chart,chart.points[0].x)?.cpu,0);
 assert.equal(resourceChartPoint(chart,chart.points[1].x)?.cpu,null);
 assert.equal(resourceChartPoint(chart,chart.points[1].x)?.memory,40);
 assert.equal(resourceChartPoint(chart,(chart.points[1].x+chart.points[2].x)/2),null);
 assert.equal(resourceChartPoint(chart,12),null);
 assert.equal(resourceChartPoint(chart,988.000000000001)?.at,chart.end);
 assert.equal(resourceChartPoint(chart,1000)?.at,chart.end);
 for(const x of [NaN,-1,1001])assert.equal(resourceChartPoint(chart,x),null);
 assert.equal(resourceChartPoint(buildResourceChart([]),500),null);
});
test('hover time matching uses the selected range rather than a fixed pixel tolerance',()=>{
 const history=[sample(0),sample(1),sample(2)],week=buildResourceChart(history,'7d');
 assert.equal(resourceChartPoint(week,week.points[1].x)?.at,base+60000);
 assert.equal(resourceChartPoint(week,week.points[0].x-1),null);
});

test('resource chart uses elapsed time rather than sample indexes and breaks collection pauses',()=>{
 const chart=buildResourceChart([sample(0),sample(1),sample(10)]);
 assert.ok(Math.abs(chart.points[1].x-(12+51/60*976))<1e-9);
 assert.equal((chart.paths.cpu.match(/M/g)||[]).length,2);
 assert.equal((chart.paths.cpu.match(/L/g)||[]).length,1);
 assert.equal(chart.gaps.length,1);
 assert.equal(chart.gaps[0].from.at,base+60000);
 assert.equal(chart.gaps[0].to.at,base+600000);
});
test('unknown CPU breaks its line while actual zero stays at the same baseline as its dot',()=>{
 const chart=buildResourceChart([sample(0,0),sample(1,null),sample(2,12)]);
 assert.equal((chart.paths.cpu.match(/M/g)||[]).length,2);
 assert.equal((chart.paths.memory.match(/M/g)||[]).length,1);
 assert.equal(chart.gaps.length,0,'A CPU-only missing value is not a collection outage');
 assert.equal(resourceChartY(0),208);
 assert.equal(chart.dots.cpu[0].cpu,0);
 assert.ok(chart.paths.cpu.includes(`M${chart.points[0].x.toFixed(2)},208.00`));
 assert.equal(resourceChartY(50),110);assert.equal(resourceChartY(100),12);
});
test('last-hour range excludes overnight history and normalizes unsorted duplicate timestamps',()=>{
 const chart=buildResourceChart([sample(130,20),sample(0,5),sample(129,30),sample(130,40)]);
 assert.equal(chart.points.length,2);
 assert.equal(chart.points[0].at,base+129*60000);
 assert.equal(chart.points[1].cpu,40);
 assert.equal(chart.end,base+130*60000);
});
test('invalid timestamps and impossible rates never become a zero point or overshoot the chart',()=>{
 const chart=buildResourceChart([{...sample(0),observedAt:'invalid'},sample(1,Infinity,-1),sample(2,101,NaN)]);
 assert.equal(chart.points.length,2);assert.equal(chart.paths.cpu,' ');assert.equal(chart.paths.memory,' ');
 assert.equal(chart.dots.cpu.length,0);assert.equal(chart.dots.memory.length,0);
});
test('empty and single-sample resource charts have stable geometry without invented observations',()=>{
 assert.equal(buildResourceChart([]).start,null);
 const chart=buildResourceChart([sample(1)]);
 assert.equal(chart.points.length,1);assert.equal(chart.points[0].x,988);
 assert.equal(chart.dots.cpu.length,1);assert.equal(chart.paths.cpu.includes('NaN'),false);
});

test('failed minute-by-minute scrapes form one visible outage without connecting across unknown values',()=>{
 const chart=buildResourceChart([sample(0),sample(1,null,null),sample(2,null,null),sample(3,null,null),sample(4),sample(5)]);
 assert.equal(chart.gaps.length,1);assert.equal(chart.gaps[0].from.at,base);assert.equal(chart.gaps[0].to.at,base+240000);
 assert.equal((chart.paths.memory.match(/M/g)||[]).length,2);
 assert.equal(chart.points[1].cpu,null);assert.equal(chart.points[1].memory,null);
});

test('memory uses a trailing five-minute mean while already averaged CPU remains unchanged',()=>{
 const history=Array.from({length:7},(_,minute)=>sample(minute,minute*5,minute*10));
 const chart=buildResourceChart(history);
 assert.equal(chart.points[0].memory,0);
 assert.equal(chart.points[5].memory,25);
 assert.equal(chart.points[6].memory,35);
 assert.equal(chart.points[6].cpu,30);
 assert.equal(history[6].memory?.rate,60,'Current resource measurements are not mutated');
});

test('memory averages reset after unknown values or collection pauses and use context before the visible hour',()=>{
 const missing=buildResourceChart([sample(0,10,100),sample(1,10,null),sample(2,10,20)]);
 assert.equal(missing.points[1].memory,null);assert.equal(missing.points[2].memory,20);
 assert.equal(buildResourceChart([sample(0,10,100),sample(10,10,20)]).points[1].memory,20);
 const chart=buildResourceChart(Array.from({length:66},(_,minute)=>sample(minute,10,minute)));
 assert.equal(chart.points[0].at,base+300000);assert.equal(chart.points[0].memory,2.5);
});

test('ranges use fixed elapsed-time axes and matching five, fifteen and sixty-minute averages',()=>{
 const history=Array.from({length:121},(_,minute)=>sample(minute,minute/2,minute/2));
 const day=buildResourceChart(history,'24h'),week=buildResourceChart(history,'7d'),six=buildResourceChart(history,'6h');
 assert.equal(day.end!-day.start!,86400000);assert.equal(week.end!-week.start!,7*86400000);assert.equal(six.end!-six.start!,6*3600000);
 assert.equal(day.points.at(-1)!.memory,56.25);assert.equal(day.points.at(-1)!.cpu,56.25);
 assert.equal(week.points.at(-1)!.memory,45);assert.equal(week.points.at(-1)!.cpu,45);
 assert.equal(six.points.at(-1)!.memory,58.75);assert.equal(six.points.at(-1)!.cpu,60);
 assert.ok(week.unrecorded);assert.equal(week.points.at(-1)!.x,988);
});
