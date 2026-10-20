import { useCallback, useEffect, useRef, useState } from "react";
import { authClient, authPort, signOutEveryEnvironment } from "./client";
import { canRevalidateAdminInBackground, readAuthorizedAdmin, signInAdmin, type AdminIdentity } from "./policy";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export function useAdminAuth() {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [checking, setChecking] = useState(Boolean(authClient));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const signingIn = useRef(false);
  const verifiedAdmin = useRef<AdminIdentity | null>(null);
  const updateAdmin = useCallback((identity:AdminIdentity|null)=>{verifiedAdmin.current=identity;setAdmin(identity);},[]);

  useEffect(() => {
    if (!authClient || !authPort) return;
    const port = authPort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const { data } = authClient.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      if (event !== "SIGNED_OUT" && signingIn.current) return;
      const current = ++request.current;
      clearTimeout(timer);
      if (!session || event === "SIGNED_OUT") {
        updateAdmin(null);
        setChecking(false);
        return;
      }
      // Returning to a browser tab emits SIGNED_IN again for the existing session.
      if(!canRevalidateAdminInBackground(verifiedAdmin.current,session.user.id)){
        updateAdmin(null);
        setChecking(true);
      }
      // Supabase callbacks stay synchronous; verify identity after the auth lock is released.
      timer = setTimeout(async () => {
        try {
          const identity = await readAuthorizedAdmin(port);
          if (disposed || request.current !== current) return;
          updateAdmin(identity);
          setError(identity ? "" : "활성화된 관리자 권한이 없는 계정입니다.");
          if (!identity) await port.signOut();
        } catch (cause) {
          if (!disposed && request.current === current) { updateAdmin(null); setError(errorMessage(cause)); }
        } finally {
          if (!disposed && request.current === current) setChecking(false);
        }
      }, 0);
    });
    return () => { disposed = true; clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [updateAdmin]);

  const signIn = async (email: string, password: string) => {
    if (!authPort) { setError("로그인 연결이 준비되지 않았습니다. 운영 담당자에게 문의해 주세요."); return; }
    const current = ++request.current;
    signingIn.current = true;
    setPending(true);
    setError("");
    try {
      const identity = await signInAdmin(authPort, email, password);
      if (request.current === current) { updateAdmin(identity); setChecking(false); }
    } catch (cause) {
      if (request.current === current) { updateAdmin(null); setChecking(false); }
      setError(errorMessage(cause));
    } finally { signingIn.current = false; setPending(false); }
  };

  const signOut = async () => {
    if (!authPort) return;
    setPending(true);
    setError("");
    try { await signOutEveryEnvironment(); request.current++; updateAdmin(null); setChecking(false); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(false); }
  };

  return { admin, checking, pending, error, signIn, signOut };
}
