/**
 * Admin reasons and notes are optional in the console. The audit log and the
 * database functions still need a meaningful value, so a blank entry records
 * the action itself, and a one- or two-character entry keeps both.
 */
export function reasonOrDefault(value: unknown, action: string, maximum = 1000) {
  const reason = String(value ?? "").trim().slice(0, maximum);
  const fallback = `관리자 콘솔에서 ${action}`;
  if (reason.length >= 3) return reason;
  return reason ? `${fallback} (${reason})` : fallback;
}
