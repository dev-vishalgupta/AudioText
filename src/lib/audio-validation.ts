import { MAX_AUDIO_BYTES } from "@/config/constants";
const formats: Record<string, string[]> = {
  mp3: ["audio/mpeg", "audio/mp3"], wav: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"],
  m4a: ["audio/m4a", "audio/mp4", "audio/x-m4a"], flac: ["audio/flac", "audio/x-flac"],
  ogg: ["audio/ogg", "application/ogg"], webm: ["audio/webm", "video/webm"],
};
export function validateAudio(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!file.size) return "This file is empty. Choose a recording with audio.";
  if (file.size > MAX_AUDIO_BYTES) return "This recording exceeds 50 MB. Choose a smaller file.";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!formats[extension]) return "Choose an MP3, WAV, M4A, FLAC, OGG, or WebM audio file.";
  const mime = file.type.split(";")[0].toLowerCase();
  if (mime && mime !== "application/octet-stream" && !formats[extension].includes(mime)) return "The file type does not match its extension. Export it as a supported audio format.";
  return null;
}
// Container signatures are checked independently of browser-provided MIME and filename.
export function sniffAudio(bytes: Uint8Array): { extension: string; mime: string } | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length < 12) return null;
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { extension: "wav", mime: "audio/wav" };
  if (ascii(0, 4) === "fLaC") return { extension: "flac", mime: "audio/flac" };
  if (ascii(0, 4) === "OggS") return { extension: "ogg", mime: "audio/ogg" };
  if (ascii(4, 8) === "ftyp") return { extension: "m4a", mime: "audio/m4a" };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { extension: "webm", mime: "audio/webm" };
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0)) return { extension: "mp3", mime: "audio/mpeg" };
  return null;
}
