import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { handler } from "../server/admin-api/lambda.ts";

test("로컬 관리자 API는 Next.js의 3001 fallback origin도 허용한다", () => {
  const localServer = fs.readFileSync(path.join(process.cwd(), "server/admin-api/local-server.ts"), "utf8");
  const devRunner = fs.readFileSync(path.join(process.cwd(), "server/admin-api/dev.mjs"), "utf8");
  assert.match(localServer, /origins\.add\("http:\/\/localhost:3001"\)/);
  assert.match(localServer, /origins\.add\("http:\/\/127\.0\.0\.1:3001"\)/);
  assert.match(localServer, /ADMIN_API_PORT \?\? 3002/);
  assert.match(devRunner, /127\.0\.0\.1:3002\/api/);
});

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
