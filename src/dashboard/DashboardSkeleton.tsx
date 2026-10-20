import {AdminHeader} from "./AdminHeader";
import "./dashboard.css";
export function DashboardBodySkeleton(){
  return <div className="dashboard-body-skeleton" aria-label="대시보드 불러오는 중" aria-busy="true">
    <div className="overview-grid">{[0,1,2,3].map(i=><div className="overview-metric" key={i}><div className="skeleton-line skeleton-label"/><div className="skeleton-line skeleton-value"/></div>)}</div>
    <div className="dashboard-charts"><div className="dashboard-panel skeleton-chart"><div className="skeleton-line skeleton-label"/><div className="skeleton-plot"/></div><div className="dashboard-panel skeleton-chart"><div className="skeleton-line skeleton-label"/><div className="skeleton-ring"/><div className="skeleton-line skeleton-value"/></div></div>
    <div className="dashboard-panel skeleton-table"><div className="skeleton-line skeleton-label"/>{[0,1,2].map(i=><div key={i} className="skeleton-line skeleton-row"/>)}</div>
  </div>;
}
export function DashboardSkeleton(){return <div className="dashboard-screen"><div className="dashboard-shell"><AdminHeader admin={null}/><main className="dashboard-main" aria-busy="true"><div className="dashboard-title-row"><h1>대시보드</h1></div><DashboardBodySkeleton/></main></div></div>;}
