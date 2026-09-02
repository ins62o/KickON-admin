import "server-only";

import { cache } from "react";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";

type PushDeliveryHealthRow = {
  latest_status: string | null;
  latest_completed_at: string | null;
  latest_error_code: string | null;
  run_count_24h: number;
  targeted_count_24h: number;
  delivered_count_24h: number;
  failed_count_24h: number;
  removed_token_count_24h: number;
};

export type PushDeliveryData = {
  connected: boolean;
  error: string | null;
  latestStatus: "succeeded" | "partial" | "failed" | null;
  latestCompletedAt: string | null;
  latestErrorCode: string | null;
  runs24h: number;
  targeted24h: number;
  delivered24h: number;
  failed24h: number;
  removedTokens24h: number;
};

const unavailable = (error: string): PushDeliveryData => ({
  connected: false,
  error,
  latestStatus: null,
  latestCompletedAt: null,
  latestErrorCode: null,
  runs24h: 0,
  targeted24h: 0,
  delivered24h: 0,
  failed24h: 0,
  removedTokens24h: 0,
});

function deliveryStatus(value: string | null): PushDeliveryData["latestStatus"] {
  return value === "succeeded" || value === "partial" || value === "failed" ? value : null;
}

export const getPushDeliveryData = cache(async (): Promise<PushDeliveryData> => {
  const client = await getOperationsClient();
  if (!client) return unavailable("Supabase 환경 변수가 설정되지 않았습니다.");

  const result = await client.rpc("get_admin_push_delivery_health");
  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return unavailable(missing ? "Push 전달 관측 마이그레이션 적용이 필요합니다." : "Push 전달 결과를 조회할 수 없습니다.");
  }

  const row = (result.data?.[0] ?? null) as PushDeliveryHealthRow | null;
  if (!row) return unavailable("Push 전달 집계 응답이 비어 있습니다.");

  return {
    connected: true,
    error: null,
    latestStatus: deliveryStatus(row.latest_status),
    latestCompletedAt: row.latest_completed_at,
    latestErrorCode: row.latest_error_code,
    runs24h: Number(row.run_count_24h ?? 0),
    targeted24h: Number(row.targeted_count_24h ?? 0),
    delivered24h: Number(row.delivered_count_24h ?? 0),
    failed24h: Number(row.failed_count_24h ?? 0),
    removedTokens24h: Number(row.removed_token_count_24h ?? 0),
  };
});
