"use client";

import { getOperationsClient } from "@/lib/data/operations-client";
import { fetchRowsForIds } from "@/lib/data/pagination";
import { loadCommunityPosts, loadAttendanceRecords } from "./activity-records";

async function activityClient() {
  const client = await getOperationsClient();
  if (!client) throw new Error("Supabase 관리자 연결을 확인해 주세요.");
  return client;
}

async function getProfileTeams(client: Awaited<ReturnType<typeof activityClient>>, ids: string[]) {
  const { data, error } = await fetchRowsForIds<{ id: string; team_id: string | null }>(ids, (batch, from, to) =>
    client.from("profiles").select("id,team_id").in("id", batch).order("id").range(from, to),
  );
  if (error) throw new Error("사용자의 응원 팀을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return new Map(data.map((profile) => [profile.id, profile.team_id]));
}

export async function getCommunityPosts(page = 1, query = "", id?: string, teamId = "") {
  const client = await activityClient();
  const data = await loadCommunityPosts(client, page, query, id, teamId);
  const teams = await getProfileTeams(client, data.records.flatMap((post) => [post.author_id, ...post.comments.map((comment) => comment.user_id)]));
  return { ...data, records: data.records.map((post) => ({
    ...post,
    author_team_id: teams.get(post.author_id) ?? null,
    comments: post.comments.map((comment) => ({ ...comment, author_team_id: teams.get(comment.user_id) ?? null })),
  })) };
}

export async function getCommunityPost(id: string) {
  const data = await getCommunityPosts(1, "", id);
  return data.records[0] ?? null;
}

export async function getAttendanceRecords(page = 1, query = "", id?: string, teamId = "") {
  const client = await activityClient();
  const data = await loadAttendanceRecords(client, page, query, id, teamId);
  const teams = await getProfileTeams(client, data.records.map((attendance) => attendance.user_id));
  return { ...data, records: data.records.map((attendance) => ({ ...attendance, user_team_id: teams.get(attendance.user_id) ?? null })) };
}

export async function getAttendanceRecord(id: string) {
  const data = await getAttendanceRecords(1, "", id);
  return data.records[0] ?? null;
}
