export const teamNames: Record<string, string> = {
  incheon: "인천 유나이티드",
  seoul: "FC 서울",
  jeonbuk: "전북 현대",
  ulsan: "울산 HD",
  daejeon: "대전 하나 시티즌",
  pohang: "포항 스틸러스",
  anyang: "FC 안양",
  bucheon: "부천 FC 1995",
  gangwon: "강원 FC",
  jeju: "제주 SK",
  gwangju: "광주 FC",
  gimcheon: "김천 상무",
  daegu: "대구 FC",
  "suwon-fc": "수원 FC",
  "seoul-eland": "서울 이랜드 FC",
  "chungnam-asan": "충남 아산 FC",
  "chungbuk-cheongju": "충북청주 FC",
  jeonnam: "전남 드래곤즈",
  yongin: "용인 FC",
  paju: "파주 프론티어",
  "cheonan-city": "천안시티 FC",
  "suwon-bluewings": "수원 삼성 블루윙즈",
  seongnam: "성남 FC",
  gyeongnam: "경남 FC",
  "ansan-greeners": "안산 그리너스",
  "busan-ipark": "부산 아이파크",
  gimpo: "김포 FC",
  hwaseong: "화성 FC",
  gimhae: "김해 FC",
};

export const KLEAGUE_ONE_TEAM_IDS = [
  "incheon", "seoul", "jeonbuk", "ulsan", "daejeon", "pohang",
  "anyang", "bucheon", "gangwon", "jeju", "gwangju", "gimcheon",
] as const;

export const KLEAGUE_TWO_TEAM_IDS = [
  "daegu", "suwon-fc", "seoul-eland", "chungnam-asan",
  "chungbuk-cheongju", "jeonnam", "yongin", "paju", "cheonan-city",
  "suwon-bluewings", "seongnam", "gyeongnam", "ansan-greeners",
  "busan-ipark", "gimpo", "hwaseong", "gimhae",
] as const;

export const TEAM_IDS_BY_LEAGUE = {
  kleague: KLEAGUE_ONE_TEAM_IDS,
  kleague2: KLEAGUE_TWO_TEAM_IDS,
} as const;

export const SUPPORTED_TEAM_IDS = [
  ...KLEAGUE_ONE_TEAM_IDS,
  ...KLEAGUE_TWO_TEAM_IDS,
] as const;

// Representative colors used by the team emblems in public/teams.
const teamColors: Record<(typeof SUPPORTED_TEAM_IDS)[number], string> = {
  incheon: "#1d4c97",
  seoul: "#b01313",
  jeonbuk: "#087d3e",
  ulsan: "#1042aa",
  daejeon: "#007c54",
  pohang: "#ab1515",
  anyang: "#6520a0",
  bucheon: "#ae1716",
  gangwon: "#e56b1f",
  jeju: "#ef6c00",
  gwangju: "#f5c400",
  gimcheon: "#b7191a",
  daegu: "#37b6ef",
  "suwon-fc": "#0e2b69",
  "seoul-eland": "#23368e",
  "chungnam-asan": "#dbba39",
  "chungbuk-cheongju": "#0c1d60",
  jeonnam: "#e4c014",
  yongin: "#6d0817",
  paju: "#091e87",
  "cheonan-city": "#125dab",
  "suwon-bluewings": "#113b94",
  seongnam: "#222222",
  gyeongnam: "#cb0e11",
  "ansan-greeners": "#0c6b57",
  "busan-ipark": "#a5151a",
  gimpo: "#a6ef1a",
  hwaseong: "#cf4f10",
  gimhae: "#b01718",
};

export function getTeamColor(teamId: string) {
  return teamColors[teamId as keyof typeof teamColors] ?? "#64748b";
}

export function getTeamName(teamId: string) {
  return teamNames[teamId] ?? teamId;
}

export function getTeamLogoPath(teamId: string) {
  return teamNames[teamId] ? `/teams/${teamId}.webp` : null;
}

export const fixtureStatusLabels = {
  SCHEDULED: "예정",
  LIVE: "진행 중",
  FINISHED: "종료",
  CANCELED: "취소",
} as const;

export type FixtureStatus = keyof typeof fixtureStatusLabels;

export const playerStatusLabels = {
  ACTIVE: "활동",
  INJURED: "부상",
  LOAN: "임대 영입",
  LOAN_OUT: "임대 이적",
  RELEASED: "방출",
  TRANSFERRED: "이적",
  RETIRED: "은퇴",
  UNKNOWN: "확인 필요",
} as const;

export type PlayerStatus = keyof typeof playerStatusLabels;
