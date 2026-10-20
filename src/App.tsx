import { useEffect } from "react";
import { DashboardSkeleton } from "./dashboard/DashboardSkeleton";
import { LoginPage } from "./components/LoginPage";
import { useAdminAuth } from "./auth/use-admin-auth";
import { Dashboard } from "./dashboard/Dashboard";
import { pageUrl } from "./dashboard/navigation";

export default function App() {
  const auth = useAdminAuth();
  useEffect(() => {
    if(auth.checking)document.title="KICKON | 관리자";
    else if(!auth.admin){
      document.title="KICKON | 관리자 로그인";
      const url=pageUrl(window.location.href,"dashboard");
      if(url!==window.location.href)window.history.replaceState(null,"",url);
    }
  }, [auth.admin, auth.checking]);
  if (auth.checking) return <DashboardSkeleton/>;
  if (!auth.admin) return <LoginPage checking={auth.checking} pending={auth.pending} error={auth.error} signIn={auth.signIn} />;
  return <Dashboard key={auth.admin.userId} admin={auth.admin} pending={auth.pending} error={auth.error} signOut={auth.signOut} />;
}
