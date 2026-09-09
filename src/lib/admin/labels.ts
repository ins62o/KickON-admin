export function inquiryStatusLabel(status: string) {
  return ({ RECEIVED: "새 문의", IN_PROGRESS: "새 문의", ANSWERED: "답변 완료", CLOSED: "답변 완료" } as Record<string, string>)[status] ?? status;
}

export function reportStatusLabel(status: string) {
  return ({ OPEN: "신규 신고", REVIEWED: "확인 중", RESOLVED: "처리 완료", DISMISSED: "기각" } as Record<string, string>)[status] ?? status;
}

export function reportTargetLabel(target: string) {
  return ({ POST: "게시글", COMMENT: "댓글", FIXTURE_CHEER: "경기 응원" } as Record<string, string>)[target] ?? target;
}

export function accountStatusLabel(status: string | null) {
  return ({ ACTIVE: "정상", SUSPENDED: "커뮤니티 정지", COMMUNITY_SUSPENDED: "커뮤니티 정지", ACCOUNT_SUSPENDED: "계정 정지", DEACTIVATED: "비활성" } as Record<string, string>)[status ?? "ACTIVE"] ?? status ?? "정상";
}

export function statusTone(status: string | null): "neutral" | "info" | "success" | "warning" | "danger" {
  if (["ACTIVE", "ANSWERED", "CLOSED", "RESOLVED", "DISMISSED", "VISIBLE", "succeeded"].includes(status ?? "")) return "success";
  if (["IN_PROGRESS", "REVIEWED", "running", "partial"].includes(status ?? "")) return "warning";
  if (["SUSPENDED", "COMMUNITY_SUSPENDED", "ACCOUNT_SUSPENDED", "HIDDEN", "failed"].includes(status ?? "")) return "danger";
  if (["RECEIVED", "OPEN"].includes(status ?? "")) return "info";
  return "neutral";
}
