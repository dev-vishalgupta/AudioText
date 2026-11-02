import { getCredential, getSettings, setConnectionStatus } from "@/server/credentials/credential-store";
import { failure, guardLocalRequest, success } from "@/server/http";
import { safeError } from "@/server/errors";
import { testConnection } from "@/server/services/transcription-service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guardLocalRequest(request);
    const key = await getCredential();
    try { await testConnection(key); setConnectionStatus("connected"); }
    catch (e) {
      const error = safeError(e);
      setConnectionStatus(error.code === "INVALID_API_KEY" || error.code === "PROVIDER_REJECTED" ? "invalid_key" : error.code === "QUOTA_EXCEEDED" ? "quota_exceeded" : "connection_failed");
      throw error;
    }
    return success(await getSettings());
  } catch (e) { return failure(e); }
}
