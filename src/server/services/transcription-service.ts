import "server-only";
import { GoogleGenAI } from "@google/genai";
import { setTimeout as delay } from "node:timers/promises";
import { MODEL, type TranscriptionMode } from "@/config/constants";
import { normalizeTranscript } from "@/lib/file-utils";
import { AppError } from "@/server/errors";
import { configureGoogleNetwork } from "@/server/network";

export function googleClient(apiKey: string) {
  configureGoogleNetwork();
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 120_000 } });
}
export async function testConnection(apiKey: string) {
  await googleClient(apiKey).models.get({ model: MODEL, config: { httpOptions: { timeout: 20_000 } } });
}
export async function transcribeAudio(apiKey: string, file: File, mime: string, mode: TranscriptionMode, signal: AbortSignal) {
  const client = googleClient(apiKey);
  let uploadedName: string | undefined;
  let phase: "upload" | "processing" | "transcription" = "upload";
  try {
    signal.throwIfAborted();
    // Keep the Files SDK's resumable-upload URL and headers intact. Its current
    // implementation replaces those defaults if upload-level httpOptions exist.
    // The client-level timeout above already bounds the upload requests.
    const uploaded = await client.files.upload({ file, config: { mimeType: mime, displayName: "AudioText recording", abortSignal: signal } });
    uploadedName = uploaded.name;
    if (!uploadedName || !uploaded.uri) throw new AppError("UPLOAD_FAILED", "Google did not accept the upload. Please try again.", 502);
    let active = uploaded;
    phase = "processing";
    while (active.state === "PROCESSING") {
      await delay(1500, undefined, { signal });
      active = await client.files.get({ name: uploadedName, config: { abortSignal: signal, httpOptions: { timeout: 20_000 } } });
    }
    if (active.state === "FAILED") throw new AppError("UPLOAD_FAILED", "Google could not process this recording. Export it again and retry.", 422);
    signal.throwIfAborted();
    phase = "transcription";
    const result = await client.interactions.create({
      model: MODEL,
      input: [{ type: "audio", uri: uploaded.uri, mime_type: mime }],
      generation_config: { transcription_config: { mode: mode === "smart" ? "smart" : { type: "verbatim" } } },
      store: false,
    }, { signal, timeout_ms: 480_000, retries: { strategy: "none" } });
    const text = normalizeTranscript(result.output_text ?? "");
    if (!text) throw new AppError("EMPTY_TRANSCRIPT", "No speech was returned. Check the recording’s volume and try again.", 422);
    return text;
  } catch (error) {
    // Diagnostics contain only allowlisted classifications, never SDK messages,
    // response bodies, request headers, file names, or credential material.
    const e = error as { name?: string; status?: number; statusCode?: number; cause?: { code?: string } };
    const kinds = ["Error", "ApiError", "APIConnectionError", "RequestTimeoutError", "ResponseValidationError", "SchemaValidationError", "ZodError", "BadRequestError", "ServerError", "ClientError", "AbortError"];
    const networkCodes = ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"];
    const status = e?.status ?? e?.statusCode;
    console.warn("AudioText provider request failed", { phase, kind: kinds.includes(e?.name ?? "") ? e.name : "Other", status: typeof status === "number" ? status : undefined, network: networkCodes.includes(e?.cause?.code ?? "") ? e.cause?.code : undefined });
    throw error;
  } finally {
    if (uploadedName) {
      try { await client.files.delete({ name: uploadedName, config: { httpOptions: { timeout: 15_000 } } }); }
      catch { console.warn("AudioText could not delete a temporary Google upload; provider expiry applies."); }
    }
  }
}
