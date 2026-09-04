import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

type Request = { uri: string };
type Redirect = { statusCode: number; statusDescription: string; headers: { location: { value: string } } };
type HandlerResult = Request | Redirect;

const source = readFileSync(new URL("../infrastructure/cloudfront/viewer-request.js", import.meta.url), "utf8");
const context = vm.createContext({ encodeURIComponent, decodeURIComponent });
vm.runInContext(source, context);
const handler = context.handler as (event: { request: Request }) => HandlerResult;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("정적 경로를 S3 index.html 객체로 변환한다", () => {
  assert.deepEqual(plain(handler({ request: { uri: "/" } })), { uri: "/index.html" });
  assert.deepEqual(plain(handler({ request: { uri: "/users/" } })), { uri: "/users/index.html" });
  assert.deepEqual(plain(handler({ request: { uri: "/users/detail" } })), { uri: "/users/detail/index.html" });
  assert.deepEqual(plain(handler({ request: { uri: "/_next/static/app.js" } })), { uri: "/_next/static/app.js" });
});

test("API 요청은 API 오리진에서 처리하도록 변경하지 않는다", () => {
  assert.deepEqual(plain(handler({ request: { uri: "/api/admin/actions" } })), { uri: "/api/admin/actions" });
});

test("기존 동적 상세 URL을 query 기반 정적 URL로 보낸다", () => {
  assert.deepEqual(plain(handler({ request: { uri: "/users/user%201" } })), {
    statusCode: 302,
    statusDescription: "Found",
    headers: { location: { value: "/users/detail/?userId=user%201" } },
  });
});

test("기존 콘솔 별칭을 새 정적 메뉴로 보낸다", () => {
  const result = handler({ request: { uri: "/cron" } });
  assert.equal("headers" in result ? result.headers.location.value : null, "/sync/?view=schedule");
  const trailingSlashResult = handler({ request: { uri: "/dashboard/" } });
  assert.equal("headers" in trailingSlashResult ? trailingSlashResult.headers.location.value : null, "/");
});
