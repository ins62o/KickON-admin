"use client";

import { getProviderUsageData } from "./platform-operations";
import { getDashboardUsageSnapshots, getUsageSnapshots } from "./usage-snapshots";

export function getDashboardUsageSnapshotsClient() {
  return getDashboardUsageSnapshots();
}

export function getUsageSnapshotsClient() {
  return getUsageSnapshots();
}

export function getProviderUsageDataClient() {
  return getProviderUsageData();
}
