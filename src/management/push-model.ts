import type {PushMode,PushSettings,PushType} from './push-settings.ts';

export const pushKinds=[
 {key:'match',description:'응원 구단 경기의 진행 상황과 득점·득점 취소를 안내해요',type:'MATCH',name:'경기 알림',when:'경기 시작 득점 득점 취소 전반 종료 후반 시작 경기 종료',audience:'해당 경기 양 팀의 팬 중 경기 알림을 켠 사용자'},
 {key:'goal',description:'응원 구단 경기의 득점과 득점 취소를 안내해요',type:'MATCH',name:'득점·득점 취소 알림',when:'확인된 득점 또는 득점 취소가 반영될 때',audience:'해당 경기 양 팀의 팬 중 득점 알림을 켠 사용자'},
 {key:'lineup',description:'응원 구단의 선발 라인업과 변경 내용을 안내해요',type:'LINEUP',name:'라인업 등록 알림',when:'선발 라인업이 확정될 때',audience:'해당 구단 팬 중 라인업 알림을 켠 사용자'},
 {key:'community',description:'내 글·댓글에 생긴 반응과 답글을 안내해요',type:'COMMUNITY',name:'커뮤니티 알림',when:'내 글에 댓글이나 반응이 달릴 때',audience:'커뮤니티 알림을 켠 해당 사용자'},
 {key:'attendance',description:'경기장 방문 전 직관 인증을 안내해요',type:'ATTENDANCE',name:'직관 알림',when:'경기 시작 2시간~90분 전 대상 확인 · 같은 시작 시간에는 1회',audience:'해당 경기 양 팀의 팬 중 가입을 완료하고 경기 알림을 켠 사용자'},
 {key:'system',description:'사용자에게 생성된 시스템 안내 알림이에요',type:'SYSTEM',name:'시스템 알림',when:'시스템 알림이 생성될 때',audience:'해당 알림의 대상 사용자'},
] as const;
export const pushSettingKinds=['lineup','match','community'] as const;
export type PushKind=(typeof pushKinds)[number]['key'];
export const pushMatchPhases=[{value:'KICKOFF',label:'경기 시작'},{value:'GOAL',label:'득점'},{value:'GOAL_CANCELLED',label:'득점 취소'},{value:'HALF_TIME',label:'전반 종료'},{value:'SECOND_HALF',label:'후반 시작'},{value:'FULL_TIME',label:'경기 종료'}] as const;
export type PushPhaseFilter='all'|(typeof pushMatchPhases)[number]['value'];
export function isPushPhaseFilter(value:unknown):value is PushPhaseFilter{return value==='all'||pushMatchPhases.some(phase=>phase.value===value);}
export type PushResultFilter='all'|'success'|'failure'|'excluded'|'no_target';
export function isPushResultFilter(value:unknown):value is PushResultFilter{return value==='all'||value==='success'||value==='failure'||value==='excluded'||value==='no_target';}
export function isPushKind(value:unknown):value is PushKind{return pushKinds.some(kind=>kind.key===value);}
const modes:Record<PushMode,{label:string;tone:string}>={OFF:{label:'발송 중단',tone:'neutral'},SHADOW:{label:'기록만',tone:'neutral'},ALLOWLIST:{label:'허용 계정만',tone:'blue'},FULL:{label:'실제 발송',tone:'green'}};
export function pushSettingStatus(data:PushSettings|null,type:PushType){
 const setting=data?.notifications.find(row=>row.type===type);
 return setting?setting.domain===null?{label:'푸시 연결 없음',tone:'neutral'}:modes[setting.mode]:{label:'확인 필요',tone:'orange'};
}
export type PushRecipient={id:string;user_id:string;nickname:string|null;team:{id:string;name:string;code:string}|null;phase?:string|null;title:string|null;body:string|null;created_at:string;status:string;last_attempted_at:string|null;last_error_code:string|null;attempts:number;targets:number;succeeded:number;failed:number;pending:number;unknown:number;shadowed:number;suppressed:number};
export function pushRecipientStatus(row:PushRecipient){
 if(row.succeeded>0)return {label:'발송 성공',tone:'green'};
 if(row.unknown>0||row.status==='UNKNOWN_OUTCOME')return {label:'결과 미확인',tone:'orange'};
 if(row.status==='DEAD_LETTER')return {label:'발송 실패',tone:'red'};
 if(['SUPPRESSED','DISMISSED'].includes(row.status))return {label:'발송 제외',tone:'neutral'};
 if(row.status==='SHADOWED')return {label:'기록만',tone:'neutral'};
 if(row.pending>0||['PENDING','PROCESSING','RETRY'].includes(row.status))return {label:row.status==='PROCESSING'?'처리 중':row.status==='RETRY'?'재시도 대기':'발송 대기',tone:'blue'};
 if(row.failed>0)return {label:'발송 실패',tone:'red'};
 if(row.shadowed>0)return {label:'기록만',tone:'neutral'};
 if(row.suppressed>0)return {label:'발송 제외',tone:'neutral'};
 if(row.targets===0&&row.status==='COMPLETED')return row.attempts===0?{label:'발송 대상 없음',tone:'neutral'}:{label:'결과 미확인',tone:'orange'};
 return {label:'확인 필요',tone:'orange'};
}

export function pushDeliveryReason(code:string){
 const reasons:Record<string,string>={
  PREFERENCE_DISABLED:'해당 종류의 알림 수신 설정이 꺼져 있거나 설정 정보가 없어 발송하지 않았어요',
  PUSH_EXPIRED:'알림 유효 시간이 지나 발송하지 않았어요',NOTIFICATION_NOT_FOUND:'알림 원문이 없어 발송하지 않았어요',
  SEND_AUTHORIZATION_DENIED:'발송 직전 대상 조건을 충족하지 못해 발송하지 않았어요',
  TOKEN_OWNERSHIP_CHANGED:'기기 토큰의 사용자 정보가 변경되어 발송하지 않았어요',LEGACY_REGISTRATION_EXPIRED:'기기의 이전 등록 정보가 만료되어 발송하지 않았어요',
  DEVICE_UNAVAILABLE:'발송할 수 없는 기기로 확인됐어요',INVALID_TOKEN:'기기 토큰이 유효하지 않아요',Unregistered:'기기의 푸시 등록이 해제됐어요',BadDeviceToken:'기기 토큰이 유효하지 않아요',
  MAX_ATTEMPTS_EXHAUSTED:'최대 재시도 횟수에 도달했어요',AUTH_CONFIGURATION:'푸시 공급자 인증 설정을 확인해야 해요',
  PROVIDER_TIMEOUT_UNKNOWN:'푸시 공급자 응답 시간이 초과되어 접수 여부를 확인할 수 없어요',PROVIDER_RESPONSE_LOST:'푸시 공급자 응답을 받지 못해 접수 여부를 확인할 수 없어요',
  LEASE_EXPIRED_AFTER_RESERVATION:'발송 처리 중 작업 시간이 만료되어 결과를 확인할 수 없어요',
 };
 return Object.hasOwn(reasons,code)?reasons[code]:'상세 설명이 등록되지 않은 사유예요';
}
