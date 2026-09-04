"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { getActiveConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";
import { resolveAdminApiBaseUrl } from "@/lib/admin-api-base-url";

const ADMIN_API_TIMEOUT_MS = 12_000;

export function getAdminApiBaseUrl(
  environment: ConsoleEnvironment = getActiveConsoleEnvironment(),
) {
  return resolveAdminApiBaseUrl(environment);
}

export async function callAdminApi<T>(
  path: string,
  init: RequestInit = {},
  environment: ConsoleEnvironment = getActiveConsoleEnvironment(),
): Promise<T> {
  const baseUrl = getAdminApiBaseUrl(environment);
  if (!baseUrl) throw new Error(`${environment === "production" ? "운영" : "개발"} 관리자 API 주소가 설정되지 않았습니다.`);

  const supabase = getBrowserSupabaseClient(environment);
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(ADMIN_API_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException
      && (error.name === "TimeoutError" || error.name === "AbortError")
      && !init.signal;
    if (timedOut) {
      throw new Error(`${environment === "production" ? "운영" : "개발"} 관리자 API 응답 시간이 12초를 초과했습니다.`);
    }
    throw error;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = body && typeof body === "object"
      ? body as { error?: unknown; message?: unknown }
      : null;
    const message = typeof errorBody?.message === "string"
      ? errorBody.message
      : typeof errorBody?.error === "string"
        ? errorBody.error
        : `요청에 실패했습니다. (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function formDataPayload(formData: FormData) {
  return Object.fromEntries(
    Array.from(formData.entries(), ([key, value]) => [key, typeof value === "string" ? value : value.name]),
  );
}

export async function callAdminAction<T>(action: string, formData: FormData): Promise<T> {
  return callAdminApi<T>("/admin/actions", {
    method: "POST",
    body: JSON.stringify({ action, payload: formDataPayload(formData) }),
  });
}
