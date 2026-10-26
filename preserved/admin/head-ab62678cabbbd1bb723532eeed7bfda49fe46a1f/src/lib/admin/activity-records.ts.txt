export type ActivityRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export const ACTIVITY_PAGE_SIZE = 50;
const MAX_PAGE = Math.floor(2_147_483_647 / ACTIVITY_PAGE_SIZE);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CommunityComment = {
  id: string;
  user_id: string;
  author_name: string | null;
  content: string;
  emoticon_key: string | null;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  moderation_status: string;
};

export type CommunityPost = {
  id: string;
  board: string;
  category: string;
  team_id: string;
  team_name: string | null;
  title: string;
  content: string;
  image_urls: string[];
  emoticon_key: string | null;
  author_id: string;
  author_name: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  comments: CommunityComment[];
  created_at: string;
  updated_at: string;
  moderation_status: string;
  moderated_at: string | null;
};

export type AttendanceRecord = {
  id: string;
  user_id: string;
  user_name: string | null;
  team_id: string;
  team_name: string | null;
  stadium_id: string;
  stadium_name: string | null;
  stadium_address: string | null;
  fixture_id: string;
  fixture: {
    league_id: string;
    round: number | null;
    home_team_name: string | null;
    away_team_name: string | null;
    kickoff_at: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    attendance_latitude: number | null;
    attendance_longitude: number | null;
    attendance_radius_meters: number | null;
  } | null;
  verified_at: string;
  verification_type: string;
  latitude: number;
  longitude: number;
  distance_from_stadium: number;
  result: string;
};

export type ActivityRecords<T> = { total: number; records: T[] };

export function getActivityPageNumber(value: string | null): number {
  const page = value && /^[1-9]\d*$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : 1;
}

async function loadRecords<T extends { id: string }>(
  client: ActivityRpcClient,
  rpcName: string,
  idKey: string,
  page: number,
  query: string,
  id?: string,
  filters: Record<string, unknown> = {},
): Promise<ActivityRecords<T>> {
  if (id !== undefined && !UUID_PATTERN.test(id)) throw new Error("상세 내역을 찾을 수 없습니다. 목록에서 다시 선택해 주세요.");
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) throw new Error("목록 페이지를 확인해 주세요.");
  const { data, error } = await client.rpc(rpcName, {
    [idKey]: id ?? null,
    p_query: query.trim().slice(0, 200),
    p_offset: (page - 1) * ACTIVITY_PAGE_SIZE,
    p_limit: ACTIVITY_PAGE_SIZE,
    ...filters,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("상세 조회 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    if (error.code === "42501" || error.message.includes("PERMISSION_REQUIRED")) throw new Error("이 내역을 조회할 관리자 권한이 없습니다.");
    throw new Error("내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("조회 응답을 확인할 수 없습니다.");
  const payload = data as Record<string, unknown>;
  if (typeof payload.total !== "number" || !Number.isSafeInteger(payload.total) || payload.total < 0 ||
    !Array.isArray(payload.records) || !payload.records.every((record) => (
      record && typeof record === "object" && typeof record.id === "string" && UUID_PATTERN.test(record.id)
    ))) throw new Error("조회 응답을 확인할 수 없습니다.");
  return { total: payload.total, records: payload.records as T[] };
}

export function loadCommunityPosts(client: ActivityRpcClient, page = 1, query = "", id?: string, teamId = "") {
  return loadRecords<CommunityPost>(client, "admin_get_community_posts", "p_post_id", page, query, id, { p_team_id: teamId || null });
}

export function loadAttendanceRecords(client: ActivityRpcClient, page = 1, query = "", id?: string, teamId = "") {
  return loadRecords<AttendanceRecord>(client, "admin_get_attendance_records", "p_attendance_id", page, query, id, { p_team_id: teamId || null });
}
