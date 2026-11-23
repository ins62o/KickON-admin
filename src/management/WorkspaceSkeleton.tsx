import {Skeleton} from "@seed-design/react";
// Kept apart from WorkspaceUI so the dashboard can show it while a workspace's code is still loading.
export function WorkspaceSkeleton(){return <div className="workspace-skeleton" aria-busy="true" aria-label="불러오는 중">{[0,1,2,3,4].map(i=><Skeleton key={i} className="skeleton-row" height="42px" radius="8"/>)}</div>;}
