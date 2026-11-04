import { parseBuffer } from "music-metadata";
import { validateAudio, sniffAudio } from "@/lib/audio-validation";
import { MAX_DURATION_SECONDS } from "@/config/constants";
import { AppError } from "@/lib/errors";
export async function validateAudioContent(file: File) {
  const error = validateAudio(file);
  if (error) throw new AppError("INVALID_AUDIO", error);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffAudio(bytes);
  if (!format || format.extension !== file.name.split(".").pop()?.toLowerCase()) throw new AppError("INVALID_AUDIO", "This file does not contain the expected audio format. Export a fresh audio file and try again.");
  try {
    const metadata = await parseBuffer(bytes, { mimeType: format.mime, size: file.size }, { duration: true, skipCovers: true });
    if (!metadata.format.codec || !metadata.format.sampleRate || !metadata.format.numberOfChannels) throw new Error("No audio stream");
    const duration = metadata.format.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) throw new AppError("INVALID_AUDIO", "The recording’s duration could not be verified. Export it as WAV or MP3 and try again.");
    if (duration > MAX_DURATION_SECONDS) throw new AppError("AUDIO_TOO_LONG", "This recording is longer than 30 minutes. Trim it and try again.");
    if (metadata.format.trackInfo?.some(track => track.type === 1)) throw new AppError("INVALID_AUDIO", "Choose an audio-only recording. Video tracks are not supported.");
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError("INVALID_AUDIO", "The recording is damaged or has no readable audio. Export it again as WAV or MP3."); }
  return { mime: format.mime };
}
