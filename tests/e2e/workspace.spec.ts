import { expect, test, chromium, type Page } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { wav } from "../fixtures";

const KEY = "AQ." + "test".repeat(100) + ".token+/=_-";
const GOOGLE = "https://generativelanguage.googleapis.com";
type Mock = { status?: number; text?: string; network?: boolean; delay?: number; modelStatus?: number };
async function mockGoogle(page: Page, options: Mock = {}) {
  const calls: { url: string; method: string; body: unknown; bytes: number }[] = [];
  const logs: string[] = [];
  page.on("console", message => logs.push(message.text()));
  page.on("pageerror", error => logs.push(error.message));
  page.on("request", request => {
    expect(request.url()).not.toContain(KEY);
    if (!request.url().startsWith(GOOGLE)) expect(request.headers()["x-goog-api-key"]).toBeUndefined();
  });
  await page.route(GOOGLE + "/**", async route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.headers()["x-goog-api-key"]).toBeTruthy();
    const body = request.method() === "POST" && !url.searchParams.has("upload_id") ? request.postDataJSON() : null;
    calls.push({ url: request.url(), method: request.method(), body, bytes: request.postDataBuffer()?.length ?? 0 });
    const headers = { "access-control-allow-origin": "*", "access-control-expose-headers": "x-goog-upload-url,x-goog-upload-status" };
    if (url.pathname.includes("/models/")) return route.fulfill({ status: options.modelStatus ?? 200, headers, json: options.modelStatus ? { error: { code: options.modelStatus, message: "private-provider-error-" + KEY } } : { name: "models/gemini-3.5-transcribe" } });
    if (request.method() === "DELETE") return route.fulfill({ headers, json: {} });
    if (url.searchParams.has("upload_id")) {
      const final = request.headers()["x-goog-upload-command"]?.includes("finalize");
      return route.fulfill({ headers: { ...headers, "x-goog-upload-status": final ? "final" : "active" }, json: final ? { file: { name: "files/test", uri: GOOGLE + "/v1beta/files/test", state: "ACTIVE", mimeType: "audio/wav" } } : {} });
    }
    if (url.pathname === "/upload/v1beta/files") return route.fulfill({ headers: { ...headers, "x-goog-upload-url": GOOGLE + "/upload/v1beta/files?upload_id=test" }, body: "" });
    if (url.pathname === "/v1beta/interactions") {
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      if (options.network) return route.abort("internetdisconnected");
      return route.fulfill({ status: options.status ?? 200, headers, json: options.status ? { error: { code: options.status, message: "private-provider-error-" + KEY } } : { id: "test-interaction", status: "completed", model: "gemini-3.5-transcribe", steps: [{ type: "model_output", content: [{ type: "text", text: options.text ?? "Hello from the recording.\nA second line." }] }] } }).catch(() => {});
    }
    throw new Error("Unexpected Google path: " + url.pathname);
  });
  return { calls, logs };
}
async function save(page: Page, key = KEY) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Gemini API key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Save API key" }).click();
}
async function configure(page: Page, mock: Mock = {}) {
  const result = await mockGoogle(page, mock);
  await page.goto("/");
  await save(page);
  await expect(page.getByText("Connected. Your saved key can access", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  return result;
}
async function upload(page: Page, buffer = wav()) {
  await page.getByLabel("Choose audio file").setInputFiles({ name: "meeting.wav", mimeType: "audio/wav", buffer });
  await page.getByRole("button", { name: "Transcribe audio", exact: true }).click();
}
test("save, mask, auto-test, reload, replace and remove; no application credential API", async ({ page }, info) => {
  const { calls, logs } = await mockGoogle(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Transcribe audio", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const input = page.getByLabel("Gemini API key", { exact: true });
  await input.fill(KEY);
  await expect(input).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show API key" }).click();
  await expect(input).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Save API key" }).click();
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("type", "password");
  await expect(page.getByText("Connected. Your saved key can access", { exact: false })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(await page.locator("body").innerText()).not.toContain(KEY);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Saved API key")).toContainText("••••••••");
  await expect(page.getByText("Saved · not tested", { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1); // Loading configuration makes no provider request.
  await input.fill("fake-replacement-key");
  await page.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected. Your saved key can access", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Test connection", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Remove API key" }).click();
  await expect(page.getByText("API key removed from this browser.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Saved API key")).toHaveCount(0);
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  for (const path of ["/api/settings", "/api/settings/test-connection", "/api/transcribe"]) {
    const response = await page.request.post(path, { data: { apiKey: "fake-unused-key" } });
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("fake-unused-key");
  }
  expect(logs.join("\n")).not.toContain(KEY);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("workspace.png"), fullPage: true });
});
test("Smart upload, editing, copy, TXT download and reset", async ({ page, context }) => {
  const { calls, logs } = await configure(page);
  await upload(page);
  const editor = page.getByRole("textbox", { name: "Transcript editor" });
  await expect(editor).toHaveValue("Hello from the recording.\nA second line.");
  const inference = calls.find(c => c.url.endsWith("/interactions"))!;
  expect(inference.body).toMatchObject({ model: "gemini-3.5-transcribe", store: false, generation_config: { transcription_config: { mode: "smart" } } });
  expect(calls.at(-1)?.method).toBe("DELETE");
  await editor.fill("My edited transcript.\nAnother line.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe("My edited transcript.\nAnother line.");
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download TXT" }).click();
  const downloaded = await waiting;
  expect(downloaded.suggestedFilename()).toBe("meeting.txt");
  const stream = await downloaded.createReadStream();
  const pieces: Buffer[] = []; for await (const chunk of stream!) pieces.push(chunk);
  expect(Buffer.concat(pieces).toString()).toBe("My edited transcript.\nAnother line.");
  await page.getByRole("button", { name: "Remove audio file" }).click();
  await expect(editor).toHaveValue("My edited transcript.\nAnother line.");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Clear transcript" }).click();
  await expect(editor).toHaveValue("");
  await page.getByRole("button", { name: "New transcription" }).click();
  await expect(page.getByText("Your words will land here.")).toBeVisible();
  expect(logs.join("\n")).not.toContain(KEY);
});
test("Verbatim serializes the original native mode", async ({ page }) => {
  const { calls } = await configure(page);
  await page.getByText("Verbatim", { exact: true }).click();
  await upload(page);
  await expect(page.getByRole("textbox", { name: "Transcript editor" })).toBeVisible();
  expect(calls.find(c => c.url.endsWith("/interactions"))?.body).toMatchObject({ generation_config: { transcription_config: { mode: { type: "verbatim" } } } });
});
test("rejects unsupported, malformed and oversized audio before any upload", async ({ page }) => {
  const { calls } = await configure(page);
  await page.getByLabel("Choose audio file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Choose an MP3");
  await page.getByLabel("Choose audio file").setInputFiles({ name: "broken.wav", mimeType: "audio/wav", buffer: Buffer.from("not audio") });
  await page.getByRole("button", { name: "Transcribe audio", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("expected audio format");
  await page.getByLabel("Choose audio file").evaluate((element: HTMLInputElement) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.wav", { type: "audio/wav" }));
    element.files = transfer.files; element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("exceeds 50 MB");
  expect(calls).toHaveLength(1);
});
for (const [name, mock, message] of [
  ["quota", { status: 429 }, "quota"],
  ["network", { network: true }, "internet connection"],
  ["unavailable", { status: 503 }, "temporarily unavailable"],
  ["empty", { text: "" }, "No speech"],
] as const) test(name + " transcription failure is safe and retryable", async ({ page }) => {
  const { calls, logs } = await configure(page, mock);
  await upload(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(message);
  await expect(page.getByRole("button", { name: "Transcribe audio", exact: true })).toBeEnabled();
  expect(calls.at(-1)?.method).toBe("DELETE");
  expect(await page.locator("body").innerText()).not.toContain(KEY);
  expect(logs.join("\n")).not.toContain(KEY);
});
test("cancel and duplicate prevention", async ({ page }) => {
  const { calls } = await configure(page, { delay: 1500 });
  await upload(page);
  await expect(page.getByRole("button", { name: "Transcribing…", exact: true })).toBeDisabled();
  await expect.poll(() => calls.filter(c => c.url.endsWith("/interactions")).length).toBe(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Request cancelled.", { exact: false })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Transcript editor" })).toHaveCount(0);
  expect(calls.filter(c => c.url.endsWith("/interactions"))).toHaveLength(1);
});
test("missing IndexedDB is actionable and retry restores storage", async ({ page }) => {
  await page.addInitScript(() => {
    const original = indexedDB;
    Object.defineProperty(window, "indexedDB", { configurable: true, get: () => undefined });
    Object.defineProperty(window, "restoreStorage", { value: () => Object.defineProperty(window, "indexedDB", { configurable: true, value: original }) });
  });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Browser storage is unavailable");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Gemini API key", { exact: true }).fill(KEY);
  await page.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("could not be confirmed");
  await expect(page.getByLabel("Saved API key")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole("button", { name: "Retry storage" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
test("invalid key is saved but never falsely connected", async ({ page }) => {
  await mockGoogle(page, { modelStatus: 400 });
  await page.goto("/"); await save(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Google rejected the API key");
  await expect(page.getByText("Invalid API key", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Saved API key")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(KEY);
});
test("key survives an actual browser process restart in the same profile", async ({}, info) => {
  test.skip(info.project.name !== "desktop", "One persistent-profile check is sufficient.");
  const profile = await mkdtemp(join(tmpdir(), "audiotext-test-"));
  try {
    let context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: true });
    try {
      const page = await context.newPage();
      await mockGoogle(page); await page.goto("http://127.0.0.1:3100");
      await save(page);
      await expect(page.getByText("Connected. Your saved key can access", { exact: false })).toBeVisible();
    } finally { await context.close(); }
    context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: true });
    try {
      const page = await context.newPage();
      const { calls } = await mockGoogle(page);
      await page.goto("http://127.0.0.1:3100");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(page.getByLabel("Saved API key")).toBeVisible();
      expect(calls).toHaveLength(0);
      await page.keyboard.press("Escape");
      await upload(page);
      await expect(page.getByRole("textbox", { name: "Transcript editor" })).toBeVisible();
    } finally { await context.close(); }
  } finally {
    if (!resolve(profile).startsWith(resolve(tmpdir()) + sep + "audiotext-test-")) throw new Error("Unexpected test profile path");
    await rm(profile, { recursive: true, force: true });
  }
});
test("complete 50 MiB upload bypasses the application server", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One large-file boundary check is sufficient.");
  test.setTimeout(120_000);
  const { calls } = await configure(page);
  const buffer = Buffer.alloc(50 * 1024 * 1024);
  wav().copy(buffer, 0, 0, 44);
  buffer.writeUInt32LE(buffer.length - 8, 4); buffer.writeUInt32LE(buffer.length - 44, 40);
  buffer.writeUInt32LE(44100, 24); buffer.writeUInt32LE(88200, 28);
  const path = info.outputPath("large.wav");
  await writeFile(path, buffer);
  await page.getByLabel("Choose audio file").setInputFiles(path);
  await page.getByRole("button", { name: "Transcribe audio", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Transcript editor" })).toBeVisible({ timeout: 90_000 });
  expect(calls.filter(c => c.url.includes("upload_id")).reduce((sum, c) => sum + c.bytes, 0)).toBe(buffer.length);
});
