"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

export type CommunityNoticeTeam = {
  id: string;
  name: string;
};

export type CommunityNoticeRecord = {
  id: string;
  board: "LEAGUE" | "TEAM";
  teamId: string;
  teamName: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  moderationStatus: "VISIBLE" | "HIDDEN";
};

export type CommunityNoticeData = {
  notices: CommunityNoticeRecord[];
  teams: CommunityNoticeTeam[];
};

type NoticeRow = {
  id: string;
  board: "LEAGUE" | "TEAM";
  team_id: string;
  title: string;
  content: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  moderation_status: "VISIBLE" | "HIDDEN";
};

export async function getCommunityNoticeData(): Promise<CommunityNoticeData> {
  const client = getBrowserSupabaseClient();
  if (!client) throw new Error("Supabase 관리자 연결을 확인해 주세요.");

  const [noticeResult, teamResult] = await Promise.all([
    client
      .from("posts")
      .select("id,board,team_id,title,content,author_id,created_at,updated_at,moderation_status")
      .eq("category", "NOTICE")
      .order("created_at", { ascending: false })
      .limit(500),
    client.from("teams").select("id,name").order("name"),
  ]);

  const queryError = noticeResult.error ?? teamResult.error;
  if (queryError) throw new Error(queryError.message);

  const noticeRows = (noticeResult.data ?? []) as NoticeRow[];
  const teams = (teamResult.data ?? []) as CommunityNoticeTeam[];
  const authorIds = [...new Set(noticeRows.map((notice) => notice.author_id))];
  const profileResult = authorIds.length > 0
    ? await client.from("profiles").select("id,nickname").in("id", authorIds)
    : { data: [], error: null };

  if (profileResult.error) throw new Error(profileResult.error.message);

  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const authorNames = new Map(
    (profileResult.data ?? []).map((profile) => [String(profile.id), String(profile.nickname)]),
  );

  return {
    teams,
    notices: noticeRows.map((notice) => ({
      id: notice.id,
      board: notice.board,
      teamId: notice.team_id,
      teamName: teamNames.get(notice.team_id) ?? notice.team_id,
      title: notice.title,
      content: notice.content,
      authorId: notice.author_id,
      authorName: authorNames.get(notice.author_id) ?? "관리자",
      createdAt: notice.created_at,
      updatedAt: notice.updated_at,
      moderationStatus: notice.moderation_status,
    })),
  };
}
