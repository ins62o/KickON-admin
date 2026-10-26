const BUCKET_PAGE_SIZE = 100;
const OBJECT_PAGE_SIZE = 1_000;
const MAXIMUM_BUCKETS = 500;
const MAXIMUM_OBJECTS = 100_000;
const MAXIMUM_RESPONSE_BYTES = 4 * 1024 * 1024;
const STORAGE_TIMEOUT_MS = 8_000;
const LARGEST_OBJECT_LIMIT = 10;
const MAXIMUM_BUCKET_ID_LENGTH = 100;
const MAXIMUM_OBJECT_NAME_LENGTH = 4_096;
const MAXIMUM_CURSOR_LENGTH = 8_192;
const KOREA_OFFSET_MS = 9 * 60 * 60 * 1_000;

type StorageBucket = {
  id?: unknown;
};

type StorageObject = {
  name?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  metadata?: unknown;
};

type StorageObjectPage = {
  hasNext?: unknown;
  nextCursor?: unknown;
  objects?: unknown;
};

export type SupabaseStorageUsage = {
  configured: boolean;
  checkedAt: string | null;
  usedBytes: number | null;
  bucketCount: number | null;
  objectCount: number | null;
  unmeasuredObjectCount: number | null;
  currentMonthObjectCount: number | null;
  currentMonthUsedBytes: number | null;
  buckets: SupabaseStorageBucketUsage[];
  largestObjects: SupabaseStorageLargeObject[];
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

type StorageScanState = {
  objectCount: number;
  usedBytes: number;
  unmeasuredObjectCount: number;
  currentMonthObjectCount: number;
  currentMonthUsedBytes: number;
  largestObjects: SupabaseStorageLargeObject[];
};

function unavailableStorageUsage(
  error: string,
  configured = false,
  checkedAt: string | null = null,
): SupabaseStorageUsage {
  return {
    configured,
    checkedAt,
    usedBytes: null,
    bucketCount: null,
    objectCount: null,
    unmeasuredObjectCount: null,
    currentMonthObjectCount: null,
    currentMonthUsedBytes: null,
    buckets: [],
    largestObjects: [],
    error,
  };
}

async function readLimitedText(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_RESPONSE_BYTES) return null;

  if (!response.body) {
    const body = await response.text();
    return Buffer.byteLength(body, "utf8") <= MAXIMUM_RESPONSE_BYTES ? body : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAXIMUM_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function readJson(response: Response) {
  const body = await readLimitedText(response);
  if (body === null) throw new Error("response-too-large");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("invalid-json");
  }
}

function storageEndpoint(projectUrl: string, pathname: string) {
  const endpoint = new URL(pathname, projectUrl);
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") throw new Error("unsupported-protocol");
  return endpoint;
}

function objectSize(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(value: unknown, maximumLength: number, errorCode: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength) {
    throw new Error(errorCode);
  }
  return value;
}

function objectTimestamp(value: unknown, errorCode: string) {
  const timestamp = requiredString(value, 100, errorCode);
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) throw new Error(errorCode);
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
}

function optionalObjectTimestamp(value: unknown) {
  if (value === null || value === undefined) return null;
  const timestamp = objectTimestamp(value, "invalid-object-updated-at");
  return timestamp.iso;
}

function currentKoreaMonthBounds(now: Date) {
  const koreaNow = new Date(now.getTime() + KOREA_OFFSET_MS);
  const year = koreaNow.getUTCFullYear();
  const month = koreaNow.getUTCMonth();
  return {
    start: Date.UTC(year, month, 1) - KOREA_OFFSET_MS,
    end: Date.UTC(year, month + 1, 1) - KOREA_OFFSET_MS,
  };
}

function addSafeInteger(left: number, right: number, errorCode: string) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(errorCode);
  return result;
}

function compareLargestObjects(left: SupabaseStorageLargeObject, right: SupabaseStorageLargeObject) {
  if (left.size !== right.size) return right.size - left.size;
  const timestampOrder = Date.parse(right.updatedAt ?? right.createdAt) - Date.parse(left.updatedAt ?? left.createdAt);
  if (timestampOrder !== 0) return timestampOrder;
  const bucketOrder = left.bucketId.localeCompare(right.bucketId);
  return bucketOrder !== 0 ? bucketOrder : left.name.localeCompare(right.name);
}

function trackLargestObject(
  largestObjects: SupabaseStorageLargeObject[],
  candidate: SupabaseStorageLargeObject,
) {
  largestObjects.push(candidate);
  largestObjects.sort(compareLargestObjects);
  if (largestObjects.length > LARGEST_OBJECT_LIMIT) largestObjects.pop();
}

async function fetchStorageJson(
  endpoint: URL,
  secretKey: string,
  signal: AbortSignal,
  init?: { method: "POST"; body: string },
) {
  const response = await fetch(endpoint, {
    cache: "no-store",
    redirect: "error",
    method: init?.method ?? "GET",
    body: init?.body,
    headers: {
      Accept: "application/json",
      apikey: secretKey,
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    signal,
  });

  if (!response.ok) throw new Error(`http-${response.status}`);
  return readJson(response);
}

async function listBucketIds(projectUrl: string, secretKey: string, signal: AbortSignal) {
  const bucketIds: string[] = [];
  const seenBucketIds = new Set<string>();

  for (let offset = 0; offset < MAXIMUM_BUCKETS; offset += BUCKET_PAGE_SIZE) {
    const endpoint = storageEndpoint(projectUrl, "/storage/v1/bucket");
    endpoint.searchParams.set("limit", String(BUCKET_PAGE_SIZE));
    endpoint.searchParams.set("offset", String(offset));

    const payload = await fetchStorageJson(endpoint, secretKey, signal);
    if (!Array.isArray(payload)) throw new Error("invalid-bucket-list");

    for (const item of payload as StorageBucket[]) {
      const bucketId = requiredString(item?.id, MAXIMUM_BUCKET_ID_LENGTH, "invalid-bucket");
      if (seenBucketIds.has(bucketId)) throw new Error("duplicate-bucket");
      seenBucketIds.add(bucketId);
      bucketIds.push(bucketId);
      if (bucketIds.length > MAXIMUM_BUCKETS) throw new Error("too-many-buckets");
    }

    if (payload.length < BUCKET_PAGE_SIZE) return bucketIds;
  }

  throw new Error("too-many-buckets");
}

async function readBucketUsage(
  projectUrl: string,
  secretKey: string,
  bucketId: string,
  signal: AbortSignal,
  monthStart: number,
  monthEnd: number,
  scanState: StorageScanState,
) {
  let cursor: string | undefined;
  let usedBytes = 0;
  let objectCount = 0;
  let unmeasuredObjectCount = 0;
  let currentMonthObjectCount = 0;
  let currentMonthUsedBytes = 0;
  const seenCursors = new Set<string>();

  while (true) {
    const endpoint = storageEndpoint(
      projectUrl,
      `/storage/v1/object/list-v2/${encodeURIComponent(bucketId)}`,
    );
    const payload = await fetchStorageJson(endpoint, secretKey, signal, {
      method: "POST",
      body: JSON.stringify({
        limit: OBJECT_PAGE_SIZE,
        with_delimiter: false,
        ...(cursor ? { cursor } : {}),
      }),
    }) as StorageObjectPage;

    if (!payload || typeof payload !== "object" || !Array.isArray(payload.objects)) {
      throw new Error("invalid-object-list");
    }
    if (payload.objects.length > OBJECT_PAGE_SIZE || typeof payload.hasNext !== "boolean") {
      throw new Error("invalid-object-page");
    }

    for (const item of payload.objects as StorageObject[]) {
      const object = recordValue(item);
      if (!object) throw new Error("invalid-object");
      const name = requiredString(object.name, MAXIMUM_OBJECT_NAME_LENGTH, "invalid-object-name");
      const createdAt = objectTimestamp(object.created_at, "invalid-object-created-at");
      const updatedAt = optionalObjectTimestamp(object.updated_at);
      const metadata = recordValue(object.metadata);
      const size = objectSize(metadata?.size);

      objectCount += 1;
      scanState.objectCount += 1;
      if (scanState.objectCount > MAXIMUM_OBJECTS) throw new Error("too-many-objects");

      const uploadedThisMonth = createdAt.milliseconds >= monthStart && createdAt.milliseconds < monthEnd;
      if (uploadedThisMonth) {
        currentMonthObjectCount += 1;
        scanState.currentMonthObjectCount += 1;
      }

      if (size === null) {
        unmeasuredObjectCount += 1;
        scanState.unmeasuredObjectCount += 1;
        continue;
      }

      usedBytes = addSafeInteger(usedBytes, size, "storage-size-overflow");
      scanState.usedBytes = addSafeInteger(scanState.usedBytes, size, "storage-size-overflow");
      if (uploadedThisMonth) {
        currentMonthUsedBytes = addSafeInteger(currentMonthUsedBytes, size, "storage-size-overflow");
        scanState.currentMonthUsedBytes = addSafeInteger(
          scanState.currentMonthUsedBytes,
          size,
          "storage-size-overflow",
        );
      }
      trackLargestObject(scanState.largestObjects, {
        bucketId,
        name,
        size,
        createdAt: createdAt.iso,
        updatedAt,
      });
    }

    if (!payload.hasNext) {
      return {
        bucketId,
        objectCount,
        usedBytes,
        unmeasuredObjectCount,
        currentMonthObjectCount,
        currentMonthUsedBytes,
      } satisfies SupabaseStorageBucketUsage;
    }
    const nextCursor = requiredString(payload.nextCursor, MAXIMUM_CURSOR_LENGTH, "missing-next-cursor");
    if (seenCursors.has(nextCursor)) throw new Error("repeated-next-cursor");
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

export async function getSupabaseStorageUsage(): Promise<SupabaseStorageUsage> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_METRICS_SECRET_KEY?.trim();

  if (!projectUrl) return unavailableStorageUsage("Supabase 프로젝트 URL이 설정되지 않았습니다.");
  if (!secretKey) return unavailableStorageUsage("서버 전용 Supabase Secret API key가 설정되지 않았습니다.");
  if (!secretKey.startsWith("sb_secret_")) {
    return unavailableStorageUsage("Storage 사용량 조회에는 sb_secret_ 형식의 Secret API key가 필요합니다.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STORAGE_TIMEOUT_MS);
  const checkedAt = new Date().toISOString();

  try {
    storageEndpoint(projectUrl, "/storage/v1/bucket");
    const bucketIds = await listBucketIds(projectUrl, secretKey, controller.signal);
    const month = currentKoreaMonthBounds(new Date(checkedAt));
    const scanState: StorageScanState = {
      objectCount: 0,
      usedBytes: 0,
      unmeasuredObjectCount: 0,
      currentMonthObjectCount: 0,
      currentMonthUsedBytes: 0,
      largestObjects: [],
    };
    const buckets: SupabaseStorageBucketUsage[] = [];

    for (const bucketId of bucketIds) {
      const bucketUsage = await readBucketUsage(
        projectUrl,
        secretKey,
        bucketId,
        controller.signal,
        month.start,
        month.end,
        scanState,
      );
      buckets.push(bucketUsage);
    }

    return {
      configured: true,
      checkedAt,
      usedBytes: scanState.usedBytes,
      bucketCount: bucketIds.length,
      objectCount: scanState.objectCount,
      unmeasuredObjectCount: scanState.unmeasuredObjectCount,
      currentMonthObjectCount: scanState.currentMonthObjectCount,
      currentMonthUsedBytes: scanState.currentMonthUsedBytes,
      buckets,
      largestObjects: scanState.largestObjects,
      error: null,
    };
  } catch (error) {
    const timedOut = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    return unavailableStorageUsage(
      timedOut
        ? "Storage 사용량 조회 시간이 8초를 초과했습니다."
        : "Storage 사용량을 완전하게 집계할 수 없습니다.",
      true,
      checkedAt,
    );
  } finally {
    clearTimeout(timeout);
  }
}
