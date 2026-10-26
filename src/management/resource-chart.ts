import type {SystemSample} from './system-health.ts';
import {resourceRanges,type ResourceRange} from './system-health.ts';

export const resourceChartSize={width:1000,height:220,padding:12};
export const resourceChartY=(value:number)=>resourceChartSize.padding+(100-value)/100*(resourceChartSize.height-resourceChartSize.padding*2);
const validRate=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
type Field='cpu'|'memory';
type Point={at:number;x:number;cpu:number|null;memory:number|null};

export function buildResourceChart(history:readonly SystemSample[],range:ResourceRange='1h'){
  const {duration,average}=resourceRanges[range];
  const samples=new Map<number,SystemSample>();
  for(const sample of history){const at=Date.parse(sample.observedAt);if(Number.isFinite(at))samples.set(at,sample);}
  const ordered=[...samples].sort(([a],[b])=>a-b);
  let memoryWindow:{at:number;rate:number}[]=[];
  let cpuWindow:{at:number;rate:number}[]=[];
  const averaged=ordered.map(([at,sample],index)=>{
    const memory=validRate(sample.memory?.rate),cpu=validRate(sample.cpu),paused=index>0&&at-ordered[index-1][0]>150000;
    if(memory===null||paused)memoryWindow=[];
    if(cpu===null||paused)cpuWindow=[];
    memoryWindow=memoryWindow.filter(point=>point.at>=at-average*60000);
    cpuWindow=cpuWindow.filter(point=>point.at>=at-average*60000);
    if(memory!==null)memoryWindow.push({at,rate:memory});
    if(cpu!==null)cpuWindow.push({at,rate:cpu});
    return {at,cpu:average===5?cpu:cpuWindow.length?cpuWindow.reduce((sum,point)=>sum+point.rate,0)/cpuWindow.length:null,memory:memoryWindow.length?memoryWindow.reduce((sum,point)=>sum+point.rate,0)/memoryWindow.length:null};
  });
  const end=ordered.at(-1)?.[0]??null;
  const recent=averaged.filter(point=>end!==null&&point.at>=end-duration);
  const start=end===null?null:end-duration;
  const points:Point[]=recent.map(point=>({...point,x:resourceChartSize.padding+(point.at-start!)/Math.max(1,end!-start!)*(resourceChartSize.width-resourceChartSize.padding*2)}));
  const gaps:{from:Point;to:Point}[]=[];
  for(let index=1;index<points.length;index++){
    const from=points[index-1],to=points[index],missing=from.cpu===null&&from.memory===null;
    if(to.at-from.at>150000||missing||(to.cpu===null&&to.memory===null)){
      const gap=gaps.at(-1);
      if(missing&&gap?.to===from)gap.to=to;else gaps.push({from,to});
    }
  }
  const paths={cpu:'',memory:''},dots:{cpu:Point[];memory:Point[]}={cpu:[],memory:[]};
  // The collector runs each minute; missing values and longer pauses break each series.
  for(const field of ['cpu','memory'] as Field[]){
    let previous:Point|undefined;
    paths[field]=points.map((point,index)=>{
      const value=point[field];
      if(value===null){previous=undefined;return '';}
      const connected=previous!==undefined&&point.at-previous.at<=150000;
      const next=points[index+1];
      if((!connected&&(!next||next[field]===null||next.at-point.at>150000))||index===points.length-1)dots[field].push(point);
      previous=point;
      return `${connected?'L':'M'}${point.x.toFixed(2)},${resourceChartY(value).toFixed(2)}`;
    }).join(' ');
  }
  const unrecorded=points.length&&points[0].at-start!>150000?{from:resourceChartSize.padding,to:points[0].x}:null;
  return {start,end,points,paths,dots,gaps,unrecorded};
}

export function resourceChartPoint(chart:ReturnType<typeof buildResourceChart>,x:number){
 const {points,start,end}=chart;
 if(!Number.isFinite(x)||start===null||end===null||!points.length||x<0||x>resourceChartSize.width)return null;
 x=Math.min(resourceChartSize.width-resourceChartSize.padding,Math.max(resourceChartSize.padding,x));
 let low=0,high=points.length;
 while(low<high){const middle=Math.floor((low+high)/2);if(points[middle].x<x)low=middle+1;else high=middle;}
 const before=points[low-1],after=points[low];
 const nearest=!before?after:!after?before:x-before.x<=after.x-x?before:after;
 const at=start+(x-resourceChartSize.padding)/(resourceChartSize.width-2*resourceChartSize.padding)*(end-start);
 // A missing minute must not borrow a distant observation across a collection gap.
 return nearest&&Math.abs(nearest.at-at)<=75000?nearest:null;
}
