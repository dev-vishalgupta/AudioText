import { beforeEach, afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { wav } from "./fixtures";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), getFile: vi.fn(), deleteFile: vi.fn(), create: vi.fn(), model: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { files = { upload: mocks.upload, get: mocks.getFile, delete: mocks.deleteFile }; interactions = { create: mocks.create }; models = { get: mocks.model }; } }));
import * as settings from "@/app/api/settings/route";
import { POST as testConnection } from "@/app/api/settings/test-connection/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { transcribeAudio } from "@/server/services/transcription-service";
import { getCredential } from "@/server/credentials/credential-store";
const origin = "http://127.0.0.1:3000", fakeKey = "fake_test_key_not_a_real_credential_12345";
let temp: string;
function req(path: string, method = "POST", body?: BodyInit, extra: Record<string, string> = {}) {
  return new Request(origin + path, { method, body, headers: { host: "127.0.0.1:3000", origin, ...extra } });
}
async function save() { return settings.POST(req("/api/settings", "POST", JSON.stringify({ apiKey: fakeKey }), { "content-type": "application/json" })); }
beforeAll(async () => { temp = await mkdtemp(join(tmpdir(), "audiotext-test-")); vi.stubEnv("AUDIOTEXT_ORIGIN", origin); vi.stubEnv("AUDIOTEXT_DATA_DIR", temp); vi.stubEnv("AUDIOTEXT_MASTER_KEY", randomBytes(32).toString("base64")); });
beforeEach(() => {
  vi.clearAllMocks(); mocks.upload.mockResolvedValue({ name: "files/test", uri: "https://example.test/file", state: "ACTIVE" });
  mocks.create.mockResolvedValue({ output_text: "Hello from the recording.\nA second line." }); mocks.deleteFile.mockResolvedValue({}); mocks.model.mockResolvedValue({ name: "models/gemini-3.5-transcribe" });
});
afterAll(async () => { await rm(temp, { recursive: true, force: true }); vi.unstubAllEnvs(); });
it("saves encrypted, returns only non-sensitive settings, tests and deletes credentials", async () => {
  expect((await save()).status).toBe(200);
  expect(await getCredential()).toBe(fakeKey);
  expect(await readFile(join(temp, "credential.json"), "utf8")).not.toContain(fakeKey);
  const read = await settings.GET(req("/api/settings", "GET"));
  expect(await read.json()).toEqual({ success: true, configured: true, status: "configured", model: "gemini-3.5-transcribe" });
  const tested = await testConnection(req("/api/settings/test-connection"));
  expect(await tested.json()).toMatchObject({ status: "connected" });
  expect(mocks.model).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.5-transcribe" }));
  expect((await settings.DELETE(req("/api/settings", "DELETE"))).status).toBe(200);
  expect(await (await settings.GET(req("/api/settings", "GET"))).json()).toMatchObject({ configured: false });
});
it("blocks foreign origins and hosts, invalid JSON, oversized key bodies and invalid keys", async () => {
  expect((await settings.POST(req("/api/settings", "POST", "{}", { origin: "https://evil.test" }))).status).toBe(403);
  expect((await settings.GET(req("/api/settings", "GET", undefined, { host: "evil.test" }))).status).toBe(403);
  expect((await settings.POST(req("/api/settings", "POST", "bad", { "content-type": "application/json" }))).status).toBe(400);
  for (const apiKey of ["", " ", "key with spaces", "key\nwith\nbreaks", "a".repeat(4097)]) {
    expect((await settings.POST(req("/api/settings", "POST", JSON.stringify({ apiKey }), { "content-type": "application/json" }))).status).toBe(400);
  }
  expect((await settings.POST(req("/api/settings", "POST", "a".repeat(16 * 1024 + 1), { "content-type": "application/json" }))).status).toBe(413);
});
it("preserves long authorization-style keys with punctuation instead of guessing Google's format", async () => {
  const apiKey = `AQ.${"test".repeat(100)}.token+/=_-`;
  const response = await settings.POST(req("/api/settings", "POST", JSON.stringify({ apiKey }), { "content-type": "application/json" }));
  expect(response.status).toBe(200);
  expect(await getCredential()).toBe(apiKey);
  expect(await response.text()).not.toContain(apiKey);
});
it("reports safe connection errors and updates status", async () => {
  await save(); mocks.model.mockRejectedValueOnce({ status: 429, message: fakeKey });
  const res = await testConnection(req("/api/settings/test-connection"));
  expect(res.status).toBe(429); expect(await res.text()).not.toContain(fakeKey);
  expect(await (await settings.GET(req("/api/settings", "GET"))).json()).toMatchObject({ status: "quota_exceeded" });
});
it("validates transcription requests and uses the exact smart and verbatim SDK configuration", async () => {
  await save();
  expect((await transcribe(req("/api/transcribe", "POST", "bad"))).status).toBe(400);
  for (const mode of ["smart", "verbatim"]) {
    const form = new FormData(); form.append("audio", new File([wav()], "meeting.wav", { type: "audio/wav" })); form.append("mode", mode);
    const res = await transcribe(req("/api/transcribe", "POST", form));
    expect(await res.json()).toEqual({ success: true, transcript: "Hello from the recording.\nA second line.", model: "gemini-3.5-transcribe" });
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ model: "gemini-3.5-transcribe", store: false, generation_config: { transcription_config: { mode: mode === "smart" ? "smart" : { type: "verbatim" } } } }), expect.anything());
  }
  const invalid = new FormData(); invalid.append("audio", new File(["malicious"], "fake.wav", { type: "audio/wav" })); invalid.append("mode", "smart");
  expect((await transcribe(req("/api/transcribe", "POST", invalid))).status).toBe(400);
  expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
});
it("cleans uploads on empty output, quota failures and cancellation", async () => {
  const file = new File([wav()], "audio.wav", { type: "audio/wav" });
  mocks.create.mockResolvedValueOnce({ output_text: " " });
  await expect(transcribeAudio(fakeKey, file, "audio/wav", "smart", new AbortController().signal)).rejects.toThrow(/No speech/);
  expect(mocks.deleteFile).toHaveBeenCalled();
  mocks.create.mockRejectedValueOnce({ status: 429 });
  await expect(transcribeAudio(fakeKey, file, "audio/wav", "smart", new AbortController().signal)).rejects.toMatchObject({ status: 429 });
  const controller = new AbortController(); controller.abort();
  await expect(transcribeAudio(fakeKey, file, "audio/wav", "smart", controller.signal)).rejects.toThrow();
  expect(mocks.upload).toHaveBeenCalledTimes(2);
});
it("rejects requests without a configured key", async () => {
  await settings.DELETE(req("/api/settings", "DELETE"));
  const response = await transcribe(req("/api/transcribe"));
  expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ error: { code: "MISSING_API_KEY" } });
});
it("allows removal of a corrupt saved credential without exposing file contents", async () => {
  await save();
  await writeFile(join(temp, "credential.json"), "not valid encrypted data");
  const response = await settings.GET(req("/api/settings", "GET"));
  expect(await response.json()).toMatchObject({ configured: true, status: "connection_failed" });
  expect((await settings.DELETE(req("/api/settings", "DELETE"))).status).toBe(200);
});
