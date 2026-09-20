export function getActiveOverrideStatus<T extends { releasedAt: string | null }>(overrides: T[]) {
  const active = overrides.filter((item) => !item.releasedAt);
  const count = active.length;

  return {
    active,
    count,
    label: `수동 수정값 ${count}개 보기`,
  };
}
