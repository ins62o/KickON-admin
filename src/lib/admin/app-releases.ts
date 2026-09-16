"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

export type AppRelease = {
  platform: "android" | "ios";
  version: string;
  enabled: boolean;
  updated_at: string;
};

export type AppReleaseHistory = {
  id: string;
  actor_role: string;
  entity_id: string;
  reason: string;
  before_value: AppRelease | null;
  after_value: AppRelease;
  created_at: string;
};

export async function getAppReleaseHistory(): Promise<AppReleaseHistory[]> {
  const client = getBrowserSupabaseClient();
  if (!client) throw new Error("관리자 연결을 확인해 주세요.");
  const { data, error } = await client.from("admin_audit_logs")
    .select("id,actor_role,entity_id,reason,before_value,after_value,created_at")
    .eq("entity_type", "app_store_releases")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
  if (error) throw new Error("앱 업데이트 변경 이력을 불러오지 못했습니다.");
  return data as AppReleaseHistory[];
}

export async function getAppReleases(): Promise<AppRelease[]> {
  const client = getBrowserSupabaseClient();
  if (!client) throw new Error("관리자 연결을 확인해 주세요.");
  const { data, error } = await client.from("app_store_releases")
    .select("platform,version,enabled,updated_at").order("platform");
  if (error) throw new Error("앱 업데이트 설정을 불러오지 못했습니다. 서버 마이그레이션 적용 여부를 확인해 주세요.");
  return data as AppRelease[];
}

export async function saveAppRelease(platform: AppRelease["platform"], version: string, enabled: boolean, reason: string) {
  if (!/^\d+(?:\.\d+){0,3}$/.test(version) || reason.trim().length < 3 || reason.trim().length > 1000)
    throw new Error("버전 형식과 변경 사유를 확인해 주세요.");
  const client = getBrowserSupabaseClient();
  if (!client) throw new Error("관리자 연결을 확인해 주세요.");
  const { error } = await client.rpc("admin_set_app_store_release", {
    target_platform: platform, release_version: version,
    release_enabled: enabled, change_reason: reason.trim(),
  });
  if (error) throw new Error("저장하지 못했습니다. 관리자 권한과 서버 연결을 확인해 주세요.");
}
