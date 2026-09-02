const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function reportReferenceReason(value: string | undefined) {
  return value && UUID_PATTERN.test(value) ? `사용자 제보 #${value}` : "";
}
