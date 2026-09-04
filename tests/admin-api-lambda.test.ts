import assert from "node:assert/strict";
import test from "node:test";
import { handler } from "../server/admin-api/lambda.ts";

test("관리자 API는 허용 목록에 없는 Origin을 인증 전에 거부한다", async () => {
  const previous = process.env.ADMIN_ALLOWED_ORIGINS;
  process.env.ADMIN_ALLOWED_ORIGINS = "https://trusted.example";
  const result = await handler({
    rawPath: "/api/admin/actions",
    requestContext: { http: { method: "POST" } },
    headers: { origin: "https://untrusted.example" },
    body: "{}",
  });
  assert.equal(result.statusCode, 403);
  if (previous === undefined) delete process.env.ADMIN_ALLOWED_ORIGINS;
  else process.env.ADMIN_ALLOWED_ORIGINS = previous;
});

test("관리자 API는 bearer token이 없는 요청을 거부한다", async () => {
  const result = await handler({
    rawPath: "/api/admin/actions",
    requestContext: { http: { method: "POST" } },
    headers: {},
    body: "{}",
  });
  assert.equal(result.statusCode, 401);
});
