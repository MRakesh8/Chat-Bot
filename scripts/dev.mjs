import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const children = [
  spawn("node", ["scripts/dev-backend.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
  spawn("node", ["scripts/dev-frontend.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of children) {
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) shutdown(code);
  });
}
