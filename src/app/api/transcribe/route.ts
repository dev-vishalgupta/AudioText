import { z } from "zod";
import { MAX_AUDIO_BYTES, MODEL } from "@/config/constants";
import { getCredential } from "@/server/credentials/credential-store";
import { failure, guardLocalRequest, limitedBody, success } from "@/server/http";
import { AppError } from "@/server/errors";
import { validateAudioContent } from "@/server/services/audio";
import { transcribeAudio } from "@/server/services/transcription-service";
export const runtime = "nodejs";
export const maxDuration = 660;
let active = false;
export async function POST(request: Request) {
  let acquired = false;
  try {
    guardLocalRequest(request);
    if (active) throw new AppError("BUSY", "Another recording is being processed. Wait for it to finish before trying again.", 409);
    active = true; acquired = true;
    const apiKey = await getCredential();
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;")) throw new AppError("INVALID_REQUEST", "Choose an audio file before transcribing.");
    const body = await limitedBody(request, MAX_AUDIO_BYTES + 64 * 1024);
    let form: FormData;
    try { form = await new Response(body, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new AppError("INVALID_REQUEST", "The upload could not be read. Select the file again."); }
    const mode = z.enum(["smart", "verbatim"]).safeParse(form.get("mode"));
    const audio = form.get("audio");
    if (!mode.success || !(audio instanceof File) || form.getAll("audio").length !== 1 || form.getAll("mode").length !== 1 || [...form.keys()].some(k => k !== "audio" && k !== "mode")) throw new AppError("INVALID_REQUEST", "Provide one audio file and a Smart or Verbatim transcription mode.");
    const { mime } = await validateAudioContent(audio);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10 * 60 * 1000)]);
    const transcript = await transcribeAudio(apiKey, audio, mime, mode.data, signal);
    return success({ transcript, model: MODEL });
  } catch (e) { return failure(e); }
  finally { if (acquired) active = false; }
}
