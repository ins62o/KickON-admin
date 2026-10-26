"use client";

import { callAdminApi } from "@/lib/admin-api";
import type { ConsoleEnvironment } from "@/lib/environment";

export type SupabaseStorageUsage = {
  configured: boolean;
  checkedAt: string | null;
  usedBytes: number | null;
  bucketCount: number | null;
  objectCount: number | null;
  unmeasuredObjectCount: number | null;
  currentMonthObjectCount: number | null;
  currentMonthUsedBytes: number | null;
  storageLimitBytes: number | null;
  buckets: SupabaseStorageBucketUsage[];
  largestObjects: SupabaseStorageLargeObject[];
  detailsError?: string | null;
  error: string | null;
};

export type SupabaseStorageBucketUsage = {
  bucketId: string;
  objectCount: number;
  usedBytes: number;
  unmeasuredObjectCount: number;
  currentMonthObjectCount: number;
  currentMonthUsedBytes: number;
};

export type SupabaseStorageLargeObject = {
  bucketId: string;
  name: string;
  size: number;
  createdAt: string;
  updatedAt: string | null;
};

function unavailableStorageUsage(error: string): SupabaseStorageUsage {
  return {
    configured: false,
    checkedAt: null,
    usedBytes: null,
    bucketCount: null,
    objectCount: null,
    unmeasuredObjectCount: null,
    currentMonthObjectCount: null,
    currentMonthUsedBytes: null,
    storageLimitBytes: null,
    buckets: [],
    largestObjects: [],
    detailsError: error,
    error,
  };
}

export async function getSupabaseStorageUsage(
  environment?: ConsoleEnvironment,
): Promise<SupabaseStorageUsage> {
  try {
    return await callAdminApi<SupabaseStorageUsage>("/admin/usage/storage", {}, environment);
  } catch (error) {
    return unavailableStorageUsage(error instanceof Error
      ? error.message
      : "관리자 API에서 Storage 사용량을 확인할 수 없습니다.");
  }
}
