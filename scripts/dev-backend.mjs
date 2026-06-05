import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRootEnv } from "./load-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadRootEnv(root);

const apiDir = path.join(root, "backend", "api-server");

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: process.env.BACKEND_PORT ?? process.env.PORT ?? "5000",
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: apiDir,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Process stopped by signal ${signal}`));
        return;
      }
      code === 0
        ? resolve()
        : reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

await run("corepack", ["pnpm", "run", "build"]);
await run("corepack", ["pnpm", "run", "start"]);
