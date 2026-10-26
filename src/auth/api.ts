export function adminApiUrl(action:'environment'|'sync'|'sync-retry'|'provider-usage'|'system-metrics'|'project-restart'){
 const base=typeof __ADMIN_SETTINGS__==='undefined'?'/api/admin':__ADMIN_SETTINGS__.apiBaseUrl??'/api/admin';
 return `${base}/${action}`;
}
