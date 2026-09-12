"use client";
import { CURRENT_SEASON, SUPPORTED_LEAGUE_IDS, playerHref, playerKey } from "@/lib/football/config";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAdminPermission, type AdminRole } from "@/lib/auth/permissions";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { GlobalSearchItem, GlobalSearchResponse } from "./types";

const LIMIT = 6;
const TOTAL_LIMIT = 24;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchBucket = { items: GlobalSearchItem[]; failed: boolean };
type TeamRow = { id: string; name: string };

function pattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function unique<T>(rows: T[], key: (row: T) => string) {
  return [...new Map(rows.map((row) => [key(row), row])).values()];
}

function compact(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, 120);
}

async function searchUsers(client: SupabaseClient, query: string, searchPattern: string, teamNames: Map<string, string>): Promise<SearchBucket> {
  const completedProfiles = () => client
    .from("profiles")
    .select("id,nickname,team_id")
    .not("registration_completed_at", "is", null);
  const requests = [
    completedProfiles().ilike("nickname", searchPattern).limit(LIMIT),
  ];
  if (uuidPattern.test(query)) {
    requests.push(completedProfiles().eq("id", query).limit(1));
  }
  const results = await Promise.all(requests);
  const rows = unique(results.flatMap((result) => result.data ?? []), (row) => String(row.id)).slice(0, LIMIT);
  return {
    items: rows.map((row) => {
      const id = String(row.id);
      const team = row.team_id ? teamNames.get(String(row.team_id)) ?? String(row.team_id) : "응원 팀 미선택";
      return { id: `user-${id}`, type: "user", label: compact(row.nickname, "닉네임 미설정"), description: `${team} · ${id.slice(0, 8)}`, keywords: `${row.nickname ?? ""} ${id} ${team}`, href: `/users/detail/?userId=${encodeURIComponent(id)}` };
    }),
    failed: results.some((result) => Boolean(result.error)),
  };
}

async function searchInquiries(client: SupabaseClient, query: string, searchPattern: string): Promise<SearchBucket> {
  const select = "id,user_id,category,subject,status";
  const requests = [
    client.from("support_inquiries").select(select).ilike("subject", searchPattern).limit(LIMIT),
    client.from("support_inquiries").select(select).ilike("content", searchPattern).limit(LIMIT),
  ];
  if (uuidPattern.test(query)) requests.push(client.from("support_inquiries").select(select).eq("id", query).limit(1));
  const results = await Promise.all(requests);
  const rows = unique(results.flatMap((result) => result.data ?? []), (row) => String(row.id)).slice(0, LIMIT);
  return {
    items: rows.map((row) => {
      const id = String(row.id);
      return { id: `inquiry-${id}`, type: "inquiry", label: compact(row.subject, "제목 없는 문의"), description: `${row.category} · ${row.status} · ${String(row.user_id).slice(0, 8)}`, keywords: `${id} ${row.subject ?? ""} ${row.category ?? ""} ${row.status ?? ""}`, href: `/inquiries/detail/?inquiryId=${encodeURIComponent(id)}` };
    }),
    failed: results.some((result) => Boolean(result.error)),
  };
}

async function searchModeration(client: SupabaseClient, query: string, searchPattern: string): Promise<SearchBucket> {
  const select = "id,target_type,status,reason";
  const requests = [client.from("content_reports").select(select).ilike("reason", searchPattern).limit(LIMIT)];
  if (uuidPattern.test(query)) requests.push(client.from("content_reports").select(select).eq("id", query).limit(1));
  const results = await Promise.all(requests);
  const rows = unique(results.flatMap((result) => result.data ?? []), (row) => String(row.id)).slice(0, LIMIT);
  return {
    items: rows.map((row) => {
      const id = String(row.id);
      return { id: `moderation-${id}`, type: "moderation", label: compact(row.reason, `${row.target_type ?? "콘텐츠"} 신고`), description: `${row.target_type} · ${row.status} · ${id.slice(0, 8)}`, keywords: `${id} ${row.reason ?? ""} ${row.target_type ?? ""} ${row.status ?? ""}`, href: `/moderation/detail/?reportId=${encodeURIComponent(id)}` };
    }),
    failed: results.some((result) => Boolean(result.error)),
  };
}

async function searchPlayers(client: SupabaseClient, searchPattern: string, teamNames: Map<string, string>): Promise<SearchBucket> {
  const select = "season,league_id,player_id,player_name,display_name,display_name_ko,team_id,shirt_number,position";
  const base = () => client.from("team_players").select(select).eq("season", CURRENT_SEASON).in("league_id", SUPPORTED_LEAGUE_IDS).eq("in_squad", true).order("league_id").order("team_id").order("player_id");
  const results = await Promise.all([
    base().ilike("player_name", searchPattern).limit(LIMIT),
    base().ilike("display_name", searchPattern).limit(LIMIT),
    base().ilike("display_name_ko", searchPattern).limit(LIMIT),
  ]);
  const rows = unique(results.flatMap((result) => result.data ?? []), (row) => playerKey({ id: String(row.player_id), leagueId: row.league_id, season: row.season })).slice(0, LIMIT);
  return {
    items: rows.map((row) => {
      const id = String(row.player_id);
      const team = teamNames.get(String(row.team_id)) ?? String(row.team_id);
      return { id: `player-${playerKey({ id, leagueId: row.league_id, season: row.season })}`, type: "player", label: compact(row.display_name_ko || row.display_name || row.player_name, "이름 미확인"), description: `${team}${row.shirt_number !== null ? ` · ${row.shirt_number}번` : ""} · ${row.position ?? "포지션 미확인"}`, keywords: `${id} ${row.player_name ?? ""} ${row.display_name ?? ""} ${row.display_name_ko ?? ""} ${team}`, href: playerHref({ id, leagueId: row.league_id, season: row.season }) };
    }),
    failed: results.some((result) => Boolean(result.error)),
  };
}

export async function searchAdminData(query: string, role: AdminRole): Promise<GlobalSearchResponse> {
  const normalized = query.trim();
  if (normalized.length < 2 || normalized.length > 80) throw new Error("검색어는 2자 이상 80자 이하로 입력해 주세요.");
  const client = getBrowserSupabaseClient();
  if (!client) throw new Error("검색 데이터 연결을 확인할 수 없습니다.");

  const teamsResult = await client.from("teams").select("id,name").order("name").limit(100);
  const teamNames = new Map(((teamsResult.data ?? []) as TeamRow[]).map((team) => [team.id, team.name]));
  const searchPattern = pattern(normalized);
  const requests: Promise<SearchBucket>[] = [];
  if (hasAdminPermission(role, "users.read")) requests.push(searchUsers(client, normalized, searchPattern, teamNames));
  if (hasAdminPermission(role, "support.read")) requests.push(searchInquiries(client, normalized, searchPattern));
  if (hasAdminPermission(role, "moderation.read")) requests.push(searchModeration(client, normalized, searchPattern));
  if (hasAdminPermission(role, "data.read")) requests.push(searchPlayers(client, searchPattern, teamNames));
  const buckets = await Promise.all(requests);
  const failed = Boolean(teamsResult.error) || buckets.some((bucket) => bucket.failed);
  return { items: buckets.flatMap((bucket) => bucket.items).slice(0, TOTAL_LIMIT), error: failed ? "일부 검색 결과를 불러오지 못했습니다." : null };
}
