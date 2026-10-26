import { loadEnvConfig } from "@next/env";
import { createServer } from "node:http";
import { handler } from "./lambda.ts";

loadEnvConfig(process.cwd(), true);

const origins = new Set((process.env.ADMIN_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
origins.add("http://localhost:3000");
origins.add("http://127.0.0.1:3000");
// Next.js automatically falls back to 3001 when 3000 is already occupied.
origins.add("http://localhost:3001");
origins.add("http://127.0.0.1:3001");
process.env.ADMIN_ALLOWED_ORIGINS = [...origins].join(",");

const maximumBodyBytes = 1024 * 1024;
const parsedPort = Number(process.env.ADMIN_API_PORT ?? 3002);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 3002;

const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  request.on("data", (chunk: Buffer) => {
    receivedBytes += chunk.byteLength;
    if (receivedBytes <= maximumBodyBytes) chunks.push(chunk);
  });

  request.on("end", () => {
    if (receivedBytes > maximumBodyBytes) {
      response.writeHead(413, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "요청 본문이 너무 큽니다." }));
      return;
    }

    const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(", ") : value,
    ]));
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`).pathname;
    void handler({
      rawPath: pathname,
      requestContext: { http: { method: request.method ?? "GET" } },
      headers,
      body: chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : null,
    }).then((result) => {
      response.writeHead(result.statusCode, result.headers);
      response.end(result.body);
    }).catch(() => {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "로컬 관리자 API 실행에 실패했습니다." }));
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`관리자 API: http://127.0.0.1:${port}/api`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close());
}
