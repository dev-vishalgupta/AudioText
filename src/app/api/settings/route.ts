import { z } from "zod";
import { deleteCredential, getSettings, saveCredential } from "@/server/credentials/credential-store";
import { failure, guardLocalRequest, readJson, success } from "@/server/http";
import { AppError } from "@/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Google supports multiple key types. Validate transport safety and size here;
// Google, not a guessed prefix/character pattern, decides credential validity.
const schema = z.object({ apiKey: z.string().trim().min(1).max(4096).regex(/^[\x21-\x7E]+$/) }).strict();
export async function GET(request: Request) {
  try { guardLocalRequest(request, false); return success(await getSettings()); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    guardLocalRequest(request);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new AppError("INVALID_API_KEY", "Paste the complete API key value without spaces or line breaks (up to 4,096 characters).");
    await saveCredential(parsed.data.apiKey);
    return success(await getSettings());
  } catch (e) { return failure(e); }
}
export async function DELETE(request: Request) {
  try { guardLocalRequest(request); await deleteCredential(); return success(await getSettings()); } catch (e) { return failure(e); }
}
