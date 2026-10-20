export type ResourceUsage={used:number;total:number;rate:number};
export const resourceRanges={
 '1h':{label:'최근 1시간',duration:3600000,average:5},
 '6h':{label:'최근 6시간',duration:21600000,average:5},
 '24h':{label:'최근 24시간',duration:86400000,average:15},
 '7d':{label:'최근 7일',duration:604800000,average:60},
} as const;
export type ResourceRange=keyof typeof resourceRanges;
export const isResourceRange=(value:unknown):value is ResourceRange=>typeof value==='string'&&Object.hasOwn(resourceRanges,value);
export type HealthStatus='healthy'|'warning'|'critical'|'unknown'|'unreachable';
export type SystemSample={observedAt:string;status:HealthStatus;cpu:number|null;cpuIssue?:'initial'|'missing'|'no_change'|'counter_reset'|'cores_changed'|'restarted';memory:ResourceUsage|null;disk:ResourceUsage|null;connections:ResourceUsage|null;databaseBytes:number|null;storageBytes?:number|null;bootAt:string|null};
export type SystemEvent={at:string;kind:'started'|'restart'|'unreachable'|'recovered'|'normalized'|'warning'|'critical';status:HealthStatus};
export type SystemHealth={current:SystemSample;history:SystemSample[];events:SystemEvent[];collectedSince:string;lastSuccessAt:string|null;range:ResourceRange;historyError:string|null;collectionSource?:'cloud'|'local'};
export type StoragePlan={plan:'Pro';source:string;databaseIncludedBytes:number;storageIncludedBytes:number};
export type RestartStatus='pending'|'accepted'|'unknown'|'failed';
export type RestartCapability={allowed:boolean;configured:boolean;projectRef:string|null;cooldownUntil:string|null};
export type MonitoringResponse=SystemHealth&{storagePlan:StoragePlan|null;dashboardUrl:string;restart?:RestartCapability};
