import { build as esbuild } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const outfile = path.resolve(__dirname, "dist/test-live-full.mjs");
  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/scripts/test-live-full.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile,
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });

  const proc = spawn("node", [outfile], { stdio: "inherit" });
  proc.on("exit", (code) => process.exit(code || 0));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
