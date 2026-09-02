const koreaTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
});

export function formatKoreaDateTime(value: string | null) {
  return value ? koreaTimeFormatter.format(new Date(value)) : "확인 불가";
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "확인 불가";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.round(hours / 24)}일 전`;
}

export function formatNumber(value: number | null) {
  return value === null ? "연동 필요" : new Intl.NumberFormat("ko-KR").format(value);
}

export function formatBytes(value: number | null) {
  if (value === null) return "연동 필요";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** unitIndex;
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: amount >= 10 ? 1 : 2 }).format(amount)} ${units[unitIndex]}`;
}

export function formatDecimalBytes(value: number | null) {
  if (value === null) return "연동 필요";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1_000)), units.length - 1);
  const amount = value / 1_000 ** unitIndex;
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: amount >= 10 ? 1 : 2 }).format(amount)} ${units[unitIndex]}`;
}
