import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { getApiKey, hasApiKey, saveApiKey, removeApiKey, requireApiKey } from "@/lib/credentials";
import { googleFetch } from "@/lib/gemini";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
it("persists, retrieves, replaces and removes the credential using committed transactions", async () => {
  expect(await hasApiKey()).toBe(false);
  await saveApiKey("  fake-first-key  ");
  expect(await getApiKey()).toBe("fake-first-key");
  expect(await hasApiKey()).toBe(true);
  const longKey = "AQ." + "test".repeat(100) + ".token+/=_-";
  await saveApiKey(longKey);
  expect(await requireApiKey()).toBe(longKey);
  await removeApiKey();
  expect(await getApiKey()).toBeNull();
  expect(await hasApiKey()).toBe(false);
  await expect(requireApiKey()).rejects.toThrow(/Settings/);
});
it("rejects malformed input without overwriting the saved key", async () => {
  await saveApiKey("fake-valid-key");
  for (const key of ["", "bad key", "bad\nkey", "a".repeat(4097)]) await expect(saveApiKey(key)).rejects.toThrow(/complete API key/);
  expect(await getApiKey()).toBe("fake-valid-key");
});
it("reports unavailable and blocked storage without pretending a save succeeded", async () => {
  vi.stubGlobal("indexedDB", undefined);
  await expect(saveApiKey("fake-key")).rejects.toThrow(/Browser storage/);
  vi.stubGlobal("indexedDB", { open() { throw new DOMException("Denied", "SecurityError"); } });
  await expect(hasApiKey()).rejects.toThrow(/Browser storage/);
});
it("never forwards credentials to arbitrary hosts, redirects or query keys", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const guarded = googleFetch();
  for (const url of ["https://evil.example/v1beta/files", "http://generativelanguage.googleapis.com/v1beta/files", "https://generativelanguage.googleapis.com/v1beta/files?key=secret"]) {
    await expect(guarded(url, { headers: { "x-goog-api-key": "fake-key" } })).rejects.toThrow(/unexpected API endpoint/);
  }
  expect(fetch).not.toHaveBeenCalled();
  await guarded("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe");
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
});
it("rejects a premature final upload response instead of transcribing partial audio", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { headers: { "x-goog-upload-status": "final" } })));
  await expect(googleFetch()("https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=fake", { method: "POST", headers: { "x-goog-upload-command": "upload" }, body: "partial" })).rejects.toThrow(/complete recording/);
});
