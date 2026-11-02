export const MODEL = "gemini-3.5-transcribe";
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 30 * 60;
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.flac,.ogg,.webm";
export type TranscriptionMode = "smart" | "verbatim";
