import "server-only";
import { AppError, safeError } from "./errors";
import type { ApiResult } from "@/types/api";

export function guardLocalRequest(request: Request, mutation = true) {
  const expected = new URL(process.env.AUDIOTEXT_ORIGIN || "http://127.0.0.1:3100");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(expected.hostname)) throw new AppError("LOCAL_ONLY", "AudioText must run on a loopback address in local mode.", 403);
  // Next may reconstruct request.url using an internal hostname. Validate the
  // actual inbound Host and browser Origin, rather than that internal URL.
  if (request.headers.get("host") !== expected.host) throw new AppError("ORIGIN_REJECTED", "Open AudioText using its configured local address.", 403);
  const origin = request.headers.get("origin");
  if ((mutation && origin !== expected.origin) || (origin && origin !== expected.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("ORIGIN_REJECTED", "This request did not originate from the AudioText workspace.", 403);
}
export function success<T extends object>(value: T, status = 200) {
  return Response.json({ success: true, ...value } satisfies ApiResult<T>, { status, headers: { "Cache-Control": "no-store" } });
}
export function failure(error: unknown) {
  const e = safeError(error);
  return Response.json({ success: false, error: { code: e.code, message: e.message } }, { status: e.status, headers: { "Cache-Control": "no-store" } });
}
export async function limitedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new AppError("PAYLOAD_TOO_LARGE", "This upload exceeds the allowed request size.", 413);
  if (!request.body) throw new AppError("INVALID_REQUEST", "The request body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  const timer = setTimeout(() => { void reader.cancel(); }, 120_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new AppError("PAYLOAD_TOO_LARGE", "This upload exceeds the allowed request size.", 413); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, bytes);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
export async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new AppError("INVALID_REQUEST", "Send JSON with the application/json content type.");
  try { return JSON.parse((await limitedBody(request, 16 * 1024)).toString("utf8")); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError("INVALID_REQUEST", "The request contains invalid JSON."); }
}
