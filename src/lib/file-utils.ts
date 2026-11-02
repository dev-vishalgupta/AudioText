export function downloadName(name: string) {
  const base = name.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, "") ?? "transcript";
  const safe = base.normalize("NFKC").replace(/[^\p{L}\p{M}\p{N} _-]/gu, "").trim().slice(0, 100);
  return `${safe && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe) ? safe : "transcript"}.txt`;
}
export function transcriptStats(text: string) {
  const words = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)].filter(s => s.isWordLike).length;
  return { words, characters: Array.from(text).length };
}
export function normalizeTranscript(text: string) { return text.replace(/\r\n?/g, "\n").trim(); }
export function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
export function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
