import { describe, expect, it, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { validateAudio, sniffAudio } from "@/lib/audio-validation";
import { downloadName, transcriptStats, normalizeTranscript } from "@/lib/file-utils";
import { encryptAes, decryptAes, encryptCredential, decryptCredential } from "@/server/credentials/encryption";
import { validateAudioContent } from "@/server/services/audio";
import { apiRequest } from "@/lib/api-client";
import { safeError } from "@/server/errors";
import { wav } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
describe("audio validation", () => {
  it("accepts supported MIME and rejects empty, oversized and mismatched files", () => {
    expect(validateAudio({ name: "a.mp3", size: 15, type: "audio/mpeg" })).toBeNull();
    expect(validateAudio({ name: "a.wav", size: 0, type: "audio/wav" })).toMatch(/empty/);
    expect(validateAudio({ name: "a.wav", size: 51 * 1024 ** 2, type: "audio/wav" })).toMatch(/50 MB/);
    expect(validateAudio({ name: "a.exe", size: 10, type: "audio/mpeg" })).toMatch(/Choose/);
    expect(validateAudio({ name: "a.mp3", size: 10, type: "text/plain" })).toMatch(/match/);
  });
  it("recognizes actual content and rejects renamed text and damaged audio", async () => {
    expect(sniffAudio(wav())).toEqual({ extension: "wav", mime: "audio/wav" });
    expect(sniffAudio(Buffer.from("not real audio content"))).toBeNull();
    await expect(validateAudioContent(new File([wav()], "sample.wav", { type: "audio/wav" }))).resolves.toEqual({ mime: "audio/wav" });
    await expect(validateAudioContent(new File([wav()], "renamed.mp3", { type: "audio/mpeg" }))).rejects.toThrow(/expected audio/);
    await expect(validateAudioContent(new File([Buffer.from("RIFF0000WAVEbad")], "bad.wav", { type: "audio/wav" }))).rejects.toThrow();
  });
  it("rejects recordings beyond the server duration limit", async () => {
    await expect(validateAudioContent(new File([wav(1801)], "long.wav", { type: "audio/wav" }))).rejects.toThrow(/30 minutes/);
  });
});
describe("transcript utilities", () => {
  it("creates safe names and preserves Unicode", () => {
    expect(downloadName("../../meeting: notes?.mp3")).toBe("meeting notes.txt");
    expect(downloadName("CON.wav")).toBe("transcript.txt");
    expect(downloadName("नमस्ते.m4a")).toBe("नमस्ते.txt");
  });
  it("normalizes only line endings and outer whitespace", () => expect(normalizeTranscript("  Hello\r\n\r\nworld.  ")).toBe("Hello\n\nworld."));
  it("counts words and Unicode characters", () => {
    expect(transcriptStats("")).toEqual({ words: 0, characters: 0 });
    expect(transcriptStats("Hello world! 😀")).toEqual({ words: 2, characters: 14 });
  });
});
describe("credential protection", () => {
  it("round trips authenticated encryption and rejects tampering and wrong keys", () => {
    const key = randomBytes(32), encrypted = encryptAes("secret-test-value", key);
    expect(encrypted).not.toContain("secret-test-value");
    expect(decryptAes(encrypted, key)).toBe("secret-test-value");
    expect(encryptAes("secret-test-value", key)).not.toBe(encrypted);
    expect(() => decryptAes(encrypted, randomBytes(32))).toThrow();
    const bytes = Buffer.from(encrypted, "base64"); bytes[30] ^= 1;
    expect(() => decryptAes(bytes.toString("base64"), key)).toThrow();
  });
  it.skipIf(process.platform !== "win32")("round trips real Windows DPAPI", async () => {
    const data = await encryptCredential("fake-test-credential");
    expect(data.scheme).toBe("dpapi");
    expect(data.value).not.toContain("fake-test-credential");
    expect(await decryptCredential(data)).toBe("fake-test-credential");
  });
});
describe("safe API responses", () => {
  it("extracts data and reports safe errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, transcript: "Hi" })));
    expect(await apiRequest("/api/transcribe")).toMatchObject({ transcript: "Hi" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false, error: { code: "QUOTA", message: "Try later." } }, { status: 429 })));
    await expect(apiRequest("/api/transcribe")).rejects.toThrow("Try later.");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })));
    await expect(apiRequest("/api/transcribe")).rejects.toThrow(/unreadable/);
  });
  it("never returns upstream error text or credentials", () => {
    expect(safeError(new Error("private-key-in-upstream-error")).message).not.toContain("private-key");
    expect(safeError({ status: 429 }).code).toBe("QUOTA_EXCEEDED");
    expect(safeError({ statusCode: 429 }).code).toBe("QUOTA_EXCEEDED");
    expect(safeError({ status: 403 }).code).toBe("INVALID_API_KEY");
    expect(safeError({ status: 404 }).code).toBe("MODEL_UNAVAILABLE");
  });
});
