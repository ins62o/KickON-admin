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
};

const logoTeamIds = new Set([
  "incheon", "seoul", "jeonbuk", "ulsan", "daejeon", "pohang",
  "anyang", "bucheon", "gangwon", "jeju", "gwangju", "gimcheon",
]);

export function getTeamName(teamId: string) {
  return teamNames[teamId] ?? teamId;
}

export function getTeamLogoPath(teamId: string) {
  return logoTeamIds.has(teamId) ? `/teams/${teamId}.webp` : null;
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
