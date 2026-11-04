import { IDBFactory } from "fake-indexeddb";
import { saveApiKey } from "@/lib/credentials";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { transcribeAudio, testConnection } from "@/lib/gemini";
import { safeError } from "@/lib/errors";
import { wav } from "./fixtures";

beforeEach(async () => { vi.stubGlobal("indexedDB", new IDBFactory()); await saveApiKey("fake-sdk-test-key"); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Exercise the actual installed SDK, mocking only the external HTTP boundary.
// This catches schema/serialization/response mismatches hidden by SDK mocks.
function googleHttp(status = 200) {
  const calls: Request[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); calls.push(request.clone());
    const url = new URL(request.url);
    if (url.pathname === "/upload/v1beta/files" && !url.searchParams.has("upload_id")) return new Response(null, { headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=test-session" } });
    if (url.searchParams.get("upload_id") === "test-session") return Response.json({ file: { name: "files/test", uri: "https://generativelanguage.googleapis.com/v1beta/files/test", mimeType: "audio/wav", state: "ACTIVE" } }, { headers: { "x-goog-upload-status": "final" } });
    if (url.pathname === "/v1beta/interactions") {
      if (status !== 200) return Response.json({ error: { code: status, status: "RESOURCE_EXHAUSTED", message: "private upstream details" } }, { status });
      return Response.json({ id: "test-interaction", status: "completed", model: "gemini-3.5-transcribe", steps: [{ type: "model_output", content: [{ type: "text", text: "Hello from actual SDK parsing.\nSecond line." }] }] });
    }
    if (url.pathname === "/v1beta/files/test" && request.method === "DELETE") return Response.json({});
    if (url.pathname === "/v1beta/models/gemini-3.5-transcribe") return Response.json({ name: "models/gemini-3.5-transcribe" });
    throw new Error(`Unexpected SDK request: ${request.method} ${url.pathname}`);
  }));
  return calls;
}
it.each(["smart", "verbatim"] as const)("serializes %s through the real SDK and extracts provider text", async mode => {
  const calls = googleHttp();
  const transcript = await transcribeAudio(new File([wav()], "voice.wav", { type: "audio/wav" }), mode, new AbortController().signal);
  expect(transcript).toBe("Hello from actual SDK parsing.\nSecond line.");
  expect(new URL(calls[0].url).pathname).toBe("/upload/v1beta/files");
  expect(calls[0].headers.get("x-goog-upload-protocol")).toBe("resumable");
  expect(calls[0].headers.get("x-goog-upload-command")).toBe("start");
  const inference = calls.find(r => new URL(r.url).pathname === "/v1beta/interactions")!;
  expect(await inference.json()).toMatchObject({ model: "gemini-3.5-transcribe", store: false, generation_config: { transcription_config: { mode: mode === "smart" ? "smart" : { type: "verbatim" } } } });
  expect(calls.at(-1)?.method).toBe("DELETE");
  for (const call of calls) { expect(call.url).not.toContain("fake-sdk-test-key"); expect(call.headers.get("x-goog-api-key")).toBe("fake-sdk-test-key"); }
});
it("uses the real SDK for the model access check", async () => {
  const calls = googleHttp();
  await testConnection();
  expect(calls).toHaveLength(1);
  expect(new URL(calls[0].url).pathname).toBe("/v1beta/models/gemini-3.5-transcribe");
});
it("safely handles an actual SDK quota error and deletes the upload", async () => {
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  const calls = googleHttp(429);
  const error = await transcribeAudio(new File([wav()], "voice.wav", { type: "audio/wav" }), "smart", new AbortController().signal).catch(e => e);
  expect(safeError(error).code).toBe("QUOTA_EXCEEDED");
  expect(safeError(error).message).not.toContain("private upstream details");
  expect(calls.at(-1)?.method).toBe("DELETE");
  expect(JSON.stringify(warnings.mock.calls)).not.toContain("private upstream details");
  expect(JSON.stringify(warnings.mock.calls)).not.toContain("fake-sdk-test-key");
});
