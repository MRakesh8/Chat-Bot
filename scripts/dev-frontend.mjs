import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRootEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadRootEnv(root);

const appDir = path.join(root, "frontend", "chat-app");

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: process.env.FRONTEND_PORT ?? process.env.PORT ?? "5173",
  BASE_PATH: process.env.BASE_PATH ?? "/",
  API_URL: process.env.API_URL ?? "http://localhost:5000",
};

const child = spawn("corepack", ["pnpm", "run", "dev"], {
  cwd: appDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
