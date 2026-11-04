export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function safeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = error as { status?: number; statusCode?: number; code?: number | string; name?: string } | null;
  const status = Number(e?.status ?? e?.statusCode ?? e?.code);
  if (status === 401 || status === 403) return new AppError("INVALID_API_KEY", "Google rejected the API key or its permissions. Check it in Settings and Google AI Studio.", 401);
  if (status === 429) return new AppError("QUOTA_EXCEEDED", "Google’s rate limit or quota was reached. Wait and try again, or check your quota in Google AI Studio.", 429);
  if (status === 404) return new AppError("MODEL_UNAVAILABLE", "The transcription model is unavailable to this API key. Check model access in Google AI Studio.", 502);
  if (status >= 500) return new AppError("SERVICE_UNAVAILABLE", "Google is temporarily unavailable. Please try again shortly.", 503);
  if (status === 400) return new AppError("PROVIDER_REJECTED", "Google rejected the request. Check your API key and try exporting the audio as WAV or MP3.", 400);
  if (["AbortError", "TimeoutError", "RequestTimeoutError"].includes(e?.name ?? "")) return new AppError("TIMEOUT", "The request was cancelled or timed out. Try a shorter recording.", 408);
  return new AppError("CONNECTION_FAILED", "Unable to complete the request. Check your internet connection, then try again.", 502);
}
