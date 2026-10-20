import {fixtureStatuses} from './fixture-schedule';
import {Badge} from './WorkspaceUI';

export function FixtureStatusBadge({status}:{status:string}){return <Badge tone={['FINISHED','FT'].includes(status)?'blue':['LIVE','HT'].includes(status)?'green':'neutral'}>{fixtureStatuses[status]??status}</Badge>;}
