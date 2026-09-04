"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isAdminRole } from "@/lib/auth/permissions";
import type { AdminIdentity } from "@/lib/auth/types";
import { getActiveConsoleEnvironment, subscribeToConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";

type AdminAuthContextValue = {
  admin: AdminIdentity | null;
  loading: boolean;
  switching: boolean;
  refresh: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  // Keep the server render and the first hydration render identical. The
  // stable shell remains visible while the live Supabase session is verified.
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [environment, setEnvironment] = useState<ConsoleEnvironment>(() => getActiveConsoleEnvironment());
  const activeEnvironmentRef = useRef(environment);
  const authRequestRef = useRef(0);
  const lastSessionRef = useRef<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const requestId = ++authRequestRef.current;
    const isCurrentRequest = () => (
      activeEnvironmentRef.current === environment
      && authRequestRef.current === requestId
    );
    const clearAdmin = () => {
      if (!isCurrentRequest()) return false;
      setAdmin(null);
      setLoading(false);
      setSwitching(false);
      return true;
    };

    try {
      const supabase = getBrowserSupabaseClient(environment);
      if (!supabase) {
        clearAdmin();
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        clearAdmin();
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("admin_users")
        .select("role, display_name, is_active")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (membershipError || !membership?.is_active || !isAdminRole(membership.role)) {
        if (!clearAdmin()) return;
        await supabase.auth.signOut();
        return;
      }

      if (!isCurrentRequest()) return;
      const nextAdmin: AdminIdentity = {
        userId: userData.user.id,
        email: userData.user.email ?? null,
        displayName: membership.display_name?.trim() || userData.user.email || "운영자",
        role: membership.role,
        isDevelopmentBypass: false,
      };
      setAdmin(nextAdmin);
      setLoading(false);
      setSwitching(false);
    } catch {
      clearAdmin();
    }
  }, [environment]);

  useEffect(() => {
    return subscribeToConsoleEnvironment((nextEnvironment) => {
      if (activeEnvironmentRef.current === nextEnvironment) return;
      authRequestRef.current += 1;
      lastSessionRef.current = null;
      activeEnvironmentRef.current = nextEnvironment;
      setAdmin(null);
      setLoading(true);
      setSwitching(true);
      setEnvironment(nextEnvironment);
    });
  }, []);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient(environment);
    if (!supabase) {
      const refreshTimer = window.setTimeout(() => void refresh(), 0);
      return () => window.clearTimeout(refreshTimer);
    }

    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 0);
    };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session || event === "SIGNED_OUT") {
        authRequestRef.current += 1;
        lastSessionRef.current = null;
        if (activeEnvironmentRef.current !== environment) return;
        setAdmin(null);
        setLoading(false);
        setSwitching(false);
        return;
      }

      const sessionKey = `${environment}:${session.user.id}:${session.access_token}`;
      if (event !== "USER_UPDATED" && lastSessionRef.current === sessionKey) return;
      lastSessionRef.current = sessionKey;
      scheduleRefresh();
    });

    return () => {
      authRequestRef.current += 1;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      data.subscription.unsubscribe();
    };
  }, [environment, refresh]);

  useEffect(() => {
    if (!loading && !switching && !admin) {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      const next = window.location.pathname !== "/" ? `?next=${encodeURIComponent(currentPath)}` : "";
      router.replace(`/login${next}`);
    }
  }, [admin, loading, router, switching]);

  const value = useMemo(
    () => ({ admin, loading, switching, refresh }),
    [admin, loading, refresh, switching],
  );
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("AdminAuthProvider 안에서 사용해야 합니다.");
  return context;
}
