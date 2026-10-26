import type {SystemSample,ResourceUsage} from '../../../src/management/system-health.ts';
type Metric={name:string;labels:Record<string,string>;value:number};
export type Reading={sample:SystemSample;counters:Record<string,number>};
const ratio=(used:number|undefined,total:number|undefined,allowOver=false):ResourceUsage|null=>used!==undefined&&total!==undefined&&Number.isFinite(used)&&Number.isFinite(total)&&total>0&&used>=0&&(allowOver||used<=total)?{used,total,rate:used/total*100}:null;
export function parseSystemMetrics(text:string,now:number,previous?:Reading):Reading{
 const metrics:Metric[]=[];
 for(const line of text.split('\n')){
  if(!/^(node_cpu_seconds_total|node_memory_Mem(?:Total|Available)_bytes|node_filesystem_(?:size|avail)_bytes|connection_stats_connection_count|max_connections_connection_count|pg_database_size_bytes|node_boot_time_seconds|pg_up)(?:\{|\s)/.test(line))continue;
  const match=/^([\w:]+)(?:\{(.*)\})?\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:\s+\d+)?$/.exec(line);
  if(!match)continue;
  const value=Number(match[3]);if(!Number.isFinite(value)||value<0)continue;
  const labels:Record<string,string>={};
  for(const label of (match[2]??'').matchAll(/(\w+)="((?:\\.|[^"\\])*)"/g))labels[label[1]]=label[2];
  metrics.push({name:match[1],labels,value});
 }
 if(!metrics.length)throw Error('Metrics unavailable');
 const value=(name:string,labels:Record<string,string>={})=>metrics.find(item=>item.name===name&&Object.entries(labels).every(([key,value])=>item.labels[key]===value))?.value;
 const counters=Object.fromEntries(metrics.filter(item=>item.name==='node_cpu_seconds_total'&&item.labels.cpu!==undefined&&item.labels.mode!==undefined).map(item=>[`${item.labels.cpu}:${item.labels.mode}`,item.value]));
 let cpu:number|null=null;
 let cpuIssue:SystemSample["cpuIssue"]="missing";
 const keys=Object.keys(counters).sort();
 if(keys.length)cpuIssue=previous?"cores_changed":"initial";
 if(previous&&keys.length&&keys.join('|')===Object.keys(previous.counters).sort().join('|')){
  const deltas=keys.map(key=>({key,delta:counters[key]-previous.counters[key]}));
  const total=deltas.reduce((sum,item)=>sum+item.delta,0),idle=deltas.filter(item=>item.key.endsWith(':idle')).reduce((sum,item)=>sum+item.delta,0);
  cpuIssue=deltas.some(item=>item.delta<0)?'counter_reset':'no_change';
  if(deltas.every(item=>item.delta>=0)&&total>0&&deltas.some(item=>item.key.endsWith(':idle'))){cpu=(total-idle)/total*100;cpuIssue=undefined;}
 }
 const totalMemory=value('node_memory_MemTotal_bytes'),available=value('node_memory_MemAvailable_bytes');
 const memory=ratio(totalMemory!==undefined&&available!==undefined?totalMemory-available:undefined,totalMemory);
 const totalDisk=value('node_filesystem_size_bytes',{mountpoint:'/data'}),availableDisk=value('node_filesystem_avail_bytes',{mountpoint:'/data'});
 const disk=ratio(totalDisk!==undefined&&availableDisk!==undefined?totalDisk-availableDisk:undefined,totalDisk);
 const connectionRows=metrics.filter(item=>item.name==='connection_stats_connection_count');
 const connections=ratio(connectionRows.length?connectionRows.reduce((sum,item)=>sum+item.value,0):undefined,value('max_connections_connection_count'),true);
 const boot=value('node_boot_time_seconds');
 const bootAt=boot!==undefined&&boot*1000<=now?new Date(boot*1000).toISOString():null;
 if(previous?.sample.bootAt&&bootAt&&previous.sample.bootAt!==bootAt){cpu=null;cpuIssue="restarted";}
 const pg=value('pg_up'),rates=[cpu,memory?.rate,disk?.rate,connections?.rate].filter((rate):rate is number=>rate!==undefined&&rate!==null);
 const status=pg===0||rates.some(rate=>rate>=95)?'critical':rates.some(rate=>rate>=80)?'warning':pg!==1||!memory||!disk||!connections?'unknown':'healthy';
 return {sample:{observedAt:new Date(now).toISOString(),status,cpu,...(cpuIssue?{cpuIssue}:{}),memory,disk,connections,databaseBytes:value('pg_database_size_bytes',{datname:'postgres'})??null,bootAt},counters};
}

export function advanceMetricsWindow(text:string,now:number,history:Reading[]):Reading[]{
 let readings:Reading[]=[];
 for(const reading of history){
  if(now-Date.parse(reading.sample.observedAt)>300000)continue;
  const previous=readings.at(-1);
  if(previous&&Date.parse(reading.sample.observedAt)-Date.parse(previous.sample.observedAt)>150000)readings=[];
  if(reading.sample.status==='unreachable'){readings=[];continue;}
  if(reading.sample.cpuIssue&&!['initial','no_change'].includes(reading.sample.cpuIssue))readings=[];
  readings.push(reading);
 }
 const previous=history.at(-1);
 if(previous&&now-Date.parse(previous.sample.observedAt)>150000)readings=[];
 let reading=parseSystemMetrics(text,now,readings.at(-1));
 if(reading.sample.cpuIssue&&!['initial','no_change'].includes(reading.sample.cpuIssue))readings=[];
 else if(readings.length>1)reading=parseSystemMetrics(text,now,readings[0]);
 return [...readings,reading];
}
