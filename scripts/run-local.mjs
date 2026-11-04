import { existsSync, readFileSync, cpSync, rmSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let runtime = source;
const config = join(source, ".audiotext", "local-runtime.json");
if (!existsSync(join(source, "node_modules", "next")) && existsSync(config)) runtime = JSON.parse(readFileSync(config, "utf8")).path;
if (!existsSync(join(runtime, "node_modules", "next"))) {
  console.error("Dependencies are missing. Run npm ci first. If Windows blocks writes to Documents, use a writable development directory."); process.exit(1);
}
const mode = process.argv[2] || "dev";
const commands = {
  dev: ["next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", process.env.PORT || "3100"],
  start: ["next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", process.env.PORT || "3100"],
  build: ["next/dist/bin/next", "build", "--webpack"],
  typecheck: ["typescript/bin/tsc", "--noEmit"],
  lint: ["eslint/bin/eslint.js", "."],
  test: ["vitest/vitest.mjs", "run"],
  e2e: ["@playwright/test/cli.js", "test"],
};
if (!commands[mode]) throw new Error("Unknown local command");
const inputs = ["src", "tests", "scripts", "public", "eslint.config.mjs", "vercel.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "vitest.config.ts", "playwright.config.ts", "next-env.d.ts", "package.json", "package-lock.json", ".env.local", ".env.example", "README.md"];
function sync() {
  // Prune only retired application files from the private mirror, never user data.
  const retired = ["src/app/api/settings/route.ts", "src/app/api/settings/test-connection/route.ts", "src/app/api/transcribe/route.ts", "src/server/http.ts", "src/server/errors.ts", "src/server/network.ts", "src/server/credentials/credential-store.ts", "src/server/credentials/encryption.ts", "src/server/services/audio.ts", "src/server/services/transcription-service.ts", "src/lib/api-client.ts", "tests/api.test.ts", "tests/server-only.ts"];
  for (const name of retired) rmSync(join(runtime, name), { force: true });
  for (const name of inputs) if (existsSync(join(source, name))) cpSync(join(source, name), join(runtime, name), { recursive: true, force: true });
}
const watchers = [];
if (runtime !== source) {
  console.log(`AudioText runtime: ${runtime}`);
  sync();
  if (mode === "dev") {
    let timer;
    for (const name of ["src", "public"]) if (existsSync(join(source, name))) watchers.push(watch(join(source, name), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(sync, 150); }));
  }
}
// Keep local runtime discovery out of version control; it contains paths only.
const [entry, ...args] = commands[mode];
const child = spawn(process.execPath, [join(runtime, "node_modules", entry), ...args, ...process.argv.slice(3)], { cwd: runtime, stdio: "inherit", windowsHide: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { for (const watcher of watchers) watcher.close(); process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { for (const watcher of watchers) watcher.close(); child.kill(signal); });
