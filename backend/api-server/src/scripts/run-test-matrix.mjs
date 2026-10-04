import { build } from "esbuild";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
dotenv.config({ path: path.resolve(root, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const entry = path.join(__dirname, "test-phase2-local-dev-matrix.ts");
const outfile = path.join(__dirname, "test-phase2-local-dev-matrix.bundle.mjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["pg", "dotenv", "drizzle-orm", "drizzle-orm/*"]
});

console.log("Bundled test runner successfully. Executing test matrix...\n");

const child = spawn("node", [outfile], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL
  },
  cwd: path.resolve(__dirname, "../../..")
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
