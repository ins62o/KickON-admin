type PlayerChangeDisplayInput = {
  changeType: string;
  fieldPath: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  fromTeamName: string | null;
  toTeamName: string | null;
};

const fieldLabels: Record<string, string> = {
  team: "소속 구단",
  team_id: "소속 구단",
  team_name: "소속 구단",
  squad: "선수단",
  in_squad: "선수단 포함 여부",
  shirt_number: "등번호",
  position: "포지션",
  detailed_position: "세부 포지션",
  display_name_ko: "한글명",
};

const teamChangeTypes = new Set(["squad_added", "transfer", "loan_in", "loan_out", "loan_return", "released", "contract_expired", "squad_removed"]);

export function playerChangeFieldLabel(fieldPath: string | null, changeType?: string) {
  if (fieldPath) return fieldLabels[fieldPath.toLowerCase()] ?? "변경 항목";
  return changeType && teamChangeTypes.has(changeType) ? "소속 구단" : "변경 항목";
}

export function playerChangeSummary(change: PlayerChangeDisplayInput) {
  const label = playerChangeFieldLabel(change.fieldPath, change.changeType);
  if (teamChangeTypes.has(change.changeType)) {
    return `${label} ${change.fromTeamName ?? "소속 없음"} → ${change.toTeamName ?? "소속 없음"}`;
  }
  return `${label} ${playerChangeValueLabel(change.beforeValue)} → ${playerChangeValueLabel(change.afterValue)}`;
}

export function playerChangeValueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "없음";
  if (typeof value === "boolean") return value ? "포함" : "제외";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "값 변경";

  const record = value as Record<string, unknown>;
  const preferredKeys = ["teamName", "team_name", "displayName", "display_name_ko", "name", "shirtNumber", "shirt_number", "position", "detailedPosition", "detailed_position"];
  for (const key of preferredKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
  }
  const squadValue = record.inSquad ?? record.in_squad;
  if (typeof squadValue === "boolean") return squadValue ? "선수단 포함" : "선수단 제외";
  return "관련 데이터 변경";
}

export function playerChangeSourceLabel(source: string) {
  const normalized = source.toLowerCase();
  if (normalized.includes("sportmonks")) return "외부 축구 데이터";
  if (normalized.includes("admin") || normalized.includes("manual")) return "운영자 확인";
  if (normalized.includes("sync") || normalized.includes("system")) return "자동 데이터 확인";
  return "연결된 데이터 출처";
}
