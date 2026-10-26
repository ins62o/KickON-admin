export function getServiceAccountIds(
  adminUserIds: ReadonlySet<string>,
  authProviders: ReadonlyMap<string, string>,
) {
  const excludedIds = new Set(adminUserIds);

  for (const [userId, provider] of authProviders) {
    if (provider === "email") excludedIds.add(userId);
  }

  return excludedIds;
}
