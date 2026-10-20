export function adminApiUrl(action:'environment'|'sync'|'provider-usage'|'system-metrics'|'project-restart'){
 const base=typeof __ADMIN_SETTINGS__==='undefined'?'/api/admin':__ADMIN_SETTINGS__.apiBaseUrl??'/api/admin';
 return `${base}/${action}`;
}
