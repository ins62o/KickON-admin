export function inquiryStatusLabel(status: string) {
  return ({ RECEIVED: "접수", IN_PROGRESS: "처리 중", ANSWERED: "답변 완료", CLOSED: "종료" } as Record<string, string>)[status] ?? status;
}

export function reportStatusLabel(status: string) {
  return ({ OPEN: "접수", REVIEWED: "검토 중", RESOLVED: "조치 완료", DISMISSED: "기각" } as Record<string, string>)[status] ?? status;
}

export function reportTargetLabel(target: string) {
  return ({ POST: "게시글", COMMENT: "댓글", FIXTURE_CHEER: "경기 응원" } as Record<string, string>)[target] ?? target;
}

export function accountStatusLabel(status: string | null) {
  return ({ ACTIVE: "정상", SUSPENDED: "정지", DEACTIVATED: "비활성" } as Record<string, string>)[status ?? "ACTIVE"] ?? status ?? "정상";
}

export function statusTone(status: string | null): "neutral" | "info" | "success" | "warning" | "danger" {
  if (["ACTIVE", "ANSWERED", "RESOLVED", "VISIBLE", "succeeded"].includes(status ?? "")) return "success";
  if (["IN_PROGRESS", "REVIEWED", "running", "partial"].includes(status ?? "")) return "warning";
  if (["SUSPENDED", "HIDDEN", "failed"].includes(status ?? "")) return "danger";
  if (["RECEIVED", "OPEN"].includes(status ?? "")) return "info";
  return "neutral";
}
