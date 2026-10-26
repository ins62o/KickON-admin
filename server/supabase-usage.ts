import type {StoragePlan} from '../src/management/system-health.ts';
const projectRefs=['smihjaucucffmsbktnmp','uvsmyftwwucrvoteajpi'];
const plan:StoragePlan={plan:'Pro',source:'https://supabase.com/dashboard/org/byczekebhjcaxpwcjews/usage',databaseIncludedBytes:8e9,storageIncludedBytes:100e9};
export function storagePlanFor(url:string):StoragePlan|null{return projectRefs.includes(new URL(url).hostname.split('.')[0])?plan:null;}
