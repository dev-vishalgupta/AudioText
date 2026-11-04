import { GoogleGenAI } from "@google/genai";
import { MODEL, type TranscriptionMode } from "@/config/constants";
import { normalizeTranscript } from "./file-utils";
import { AppError, safeError } from "./errors";
import { requireApiKey } from "./credentials";
import { validateAudioContent } from "./audio-content";

const GOOGLE = "https://generativelanguage.googleapis.com";
// Guard model, resumable upload, and interaction requests; never forward secrets to another host.
export function googleFetch(signal?: AbortSignal): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== GOOGLE || !/^\/(upload\/v1beta\/|v1beta\/)/.test(url.pathname) ||
        url.username || url.password || url.searchParams.has("key") || url.searchParams.has("api_key")) {
      throw new AppError("UNSAFE_ENDPOINT", "Google returned an unexpected API endpoint. Please try again.");
    }
    const signals = [request.signal, AbortSignal.timeout(480_000)];
    // Cleanup gets its own deadline and must still work after cancellation.
    if (signal && request.method !== "DELETE") signals.push(signal);
    const response = await fetch(request, { signal: AbortSignal.any(signals), credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
    // Never accept an early "final" response while the SDK still has chunks to send.
    if (response.headers.get("x-goog-upload-status") === "final" && !request.headers.get("x-goog-upload-command")?.includes("finalize")) {
      throw new AppError("INCOMPLETE_UPLOAD", "Google ended the upload before the complete recording was sent. Please retry.");
    }
    return response;
  };
}
async function client(signal?: AbortSignal) {
  return new GoogleGenAI({ apiKey: await requireApiKey(), httpOptions: { timeout: 120_000, fetch: googleFetch(signal) } });
}
export async function testConnection() {
  try { await (await client()).models.get({ model: MODEL, config: { httpOptions: { timeout: 20_000 } } }); }
  catch (error) {
    if (Number((error as { status?: number })?.status) === 400) throw new AppError("INVALID_API_KEY", "Google rejected the API key. Check it in Google AI Studio.", 401);
    throw safeError(error);
  }
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1500);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function transcribeAudio(file: File, mode: TranscriptionMode, signal: AbortSignal) {
  let uploadedName: string | undefined;
  let api: GoogleGenAI | undefined;
  try {
    if (mode !== "smart" && mode !== "verbatim") throw new AppError("INVALID_MODE", "Choose Smart or Verbatim transcription.");
    const { mime } = await validateAudioContent(file);
    signal.throwIfAborted();
    api = await client(signal);
    // Upload-level httpOptions replace the SDK's resumable headers. Keep them unset.
    // Client-level fetch and timeout apply to the upload instead.
    const uploaded = await api.files.upload({ file, config: { mimeType: mime, displayName: "AudioText recording" } });
    if (uploaded.name && /^files\/[a-zA-Z0-9_-]+$/.test(uploaded.name)) uploadedName = uploaded.name;
    if (!uploadedName || uploaded.uri !== GOOGLE + "/v1beta/" + uploadedName) throw new AppError("UPLOAD_FAILED", "Google did not accept the upload. Please try again.");
    let active = uploaded;
    while (active.state === "PROCESSING") {
      await delay(signal);
      active = await api.files.get({ name: uploadedName, config: { abortSignal: signal, httpOptions: { timeout: 20_000 } } });
    }
    if (active.state !== "ACTIVE") throw new AppError("UPLOAD_FAILED", "Google could not process this recording. Export it again and retry.");
    signal.throwIfAborted();
    const result = await api.interactions.create({
      model: MODEL, input: [{ type: "audio", uri: uploaded.uri, mime_type: mime }],
      generation_config: { transcription_config: { mode: mode === "smart" ? "smart" : { type: "verbatim" } } }, store: false,
    }, { signal, timeout_ms: 480_000, retries: { strategy: "none" } });
    if (result.status !== "completed") throw new AppError("INCOMPLETE_TRANSCRIPTION", "Google did not complete the transcription. Please retry with a shorter recording.", 502);
    const text = normalizeTranscript(result.output_text ?? "");
    if (!text) throw new AppError("EMPTY_TRANSCRIPT", "No speech was returned. Check the recording’s volume and try again.", 422);
    return text;
  } catch (error) { throw safeError(error); }
  finally {
    if (uploadedName && api) {
      try { await api.files.delete({ name: uploadedName, config: { httpOptions: { timeout: 15_000 } } }); }
      catch { /* Best effort. Google's automatic file expiry still applies. */ }
    }
  }
}
