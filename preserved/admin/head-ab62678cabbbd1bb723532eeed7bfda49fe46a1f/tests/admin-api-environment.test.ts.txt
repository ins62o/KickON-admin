import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminApiBaseUrl } from "../src/lib/admin-api-base-url.ts";

const ENVIRONMENT_KEYS = [
  "NODE_ENV",
  "NEXT_PUBLIC_KICKON_ENVIRONMENT",
  "NEXT_PUBLIC_ADMIN_API_BASE_URL",
  "NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL",
  "NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL",
] as const;
const mutableEnvironment = process.env as Record<string, string | undefined>;

function restoreEnvironment(snapshot: Map<string, string | undefined>) {
  for (const key of ENVIRONMENT_KEYS) {
    const value = snapshot.get(key);
    if (value === undefined) delete mutableEnvironment[key];
    else mutableEnvironment[key] = value;
  }
}

test("unscoped 관리자 API 주소는 빌드 환경에만 fallback한다", () => {
  const snapshot = new Map(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));

  try {
    mutableEnvironment.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT = "development";
    process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL = "http://127.0.0.1:3001/api";
    delete process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL;

    assert.equal(resolveAdminApiBaseUrl("development"), "http://127.0.0.1:3001/api");
    assert.equal(resolveAdminApiBaseUrl("production"), "");

    mutableEnvironment.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT = "production";
    process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL = "https://production-api.example/api/";

    assert.equal(resolveAdminApiBaseUrl("production"), "https://production-api.example/api");
    assert.equal(resolveAdminApiBaseUrl("development"), "");
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("개발 설정이 없으면 로컬 관리자 API를 사용한다", () => {
  const snapshot = new Map(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));

  try {
    mutableEnvironment.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT = "development";
    delete process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL;

    assert.equal(resolveAdminApiBaseUrl("development"), "http://localhost:3001/api");
    assert.equal(resolveAdminApiBaseUrl("production"), "");
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("환경별 관리자 API 주소가 unscoped 주소보다 우선한다", () => {
  const snapshot = new Map(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));

  try {
    mutableEnvironment.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT = "production";
    process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL = "https://legacy.example/api";
    process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL = "https://development.example/api/";
    process.env.NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL = "/api/";

    assert.equal(resolveAdminApiBaseUrl("development"), "https://development.example/api");
    assert.equal(resolveAdminApiBaseUrl("production"), "/api");
  } finally {
    restoreEnvironment(snapshot);
  }
});
