import { leagueLabel } from "./football/config";
export function positionLabel(value: string | null) {
  if (!value) return "확인 불가";
  const normalized = value.toLowerCase();
  if (normalized.includes("goalkeeper")) return "골키퍼";
  if (normalized.includes("defender")) return "수비수";
  if (normalized.includes("midfielder")) return "미드필더";
  if (normalized.includes("attacker") || normalized.includes("forward")) return "공격수";
  return value;
}

export function koreanLeagueLabel(value: string) {
  return leagueLabel(value);
}
