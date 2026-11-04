import { describe, expect, it, vi, afterEach } from "vitest";
import { validateAudio, sniffAudio } from "@/lib/audio-validation";
import { downloadName, transcriptStats, normalizeTranscript } from "@/lib/file-utils";
import { validateAudioContent } from "@/lib/audio-content";
import { safeError } from "@/lib/errors";
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
  it("rejects recordings beyond the application duration limit", async () => {
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
describe("safe API responses", () => {
  it("never returns upstream error text or credentials", () => {
    expect(safeError(new Error("private-key-in-upstream-error")).message).not.toContain("private-key");
    expect(safeError({ status: 429 }).code).toBe("QUOTA_EXCEEDED");
    expect(safeError({ statusCode: 429 }).code).toBe("QUOTA_EXCEEDED");
    expect(safeError({ status: 403 }).code).toBe("INVALID_API_KEY");
    expect(safeError({ status: 404 }).code).toBe("MODEL_UNAVAILABLE");
  });
});
