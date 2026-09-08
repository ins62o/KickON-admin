import nextEnv from "@next/env";
import { spawn, spawnSync } from "node:child_process";

const { loadEnvConfig } = nextEnv;

const projectDirectory = process.cwd();
const { combinedEnv } = loadEnvConfig(projectDirectory, true);
const environment = { ...process.env, ...combinedEnv };

environment.NEXT_PUBLIC_KICKON_ENVIRONMENT ||= environment.KICKON_ENVIRONMENT;

if (
  environment.KICKON_ENVIRONMENT
  && environment.NEXT_PUBLIC_KICKON_ENVIRONMENT
  && environment.KICKON_ENVIRONMENT !== environment.NEXT_PUBLIC_KICKON_ENVIRONMENT
) {
  console.error("KICKON_ENVIRONMENT와 NEXT_PUBLIC_KICKON_ENVIRONMENT가 일치해야 합니다.");
  process.exit(1);
}

environment.NEXT_PUBLIC_ADMIN_API_BASE_URL ||= "http://127.0.0.1:3002/api";
environment.ADMIN_ALLOWED_ORIGINS ||= "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001";
environment.NEXT_PUBLIC_SUPABASE_DATABASE_LIMIT_GB ||= environment.SUPABASE_DATABASE_LIMIT_GB;
environment.NEXT_PUBLIC_SUPABASE_STORAGE_LIMIT_GB ||= environment.SUPABASE_STORAGE_LIMIT_GB;
environment.NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE ||= environment.SPORTSMONKS_API_ALLOWANCE;

const build = spawnSync(
  "node_modules/esbuild/bin/esbuild",
  ["server/admin-api/local-server.ts", "--bundle", "--platform=node", "--target=node22", "--format=cjs", "--outfile=dist/admin-api/local-server.js"],
  { cwd: projectDirectory, env: environment, stdio: "inherit" },
);

if (build.status !== 0) {
  process.exitCode = build.status ?? 1;
} else {
  const api = spawn(process.execPath, ["dist/admin-api/local-server.js"], { cwd: projectDirectory, env: environment, stdio: "inherit" });
  const web = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], { cwd: projectDirectory, env: environment, stdio: "inherit" });
  let stopping = false;

  const stop = (signal = "SIGTERM", exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    api.kill(signal);
    web.kill(signal);
    process.exitCode = exitCode;
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  api.on("exit", (code) => stop("SIGTERM", code ?? 1));
  web.on("exit", (code) => stop("SIGTERM", code ?? 1));
}
