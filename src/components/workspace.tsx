"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine, ArrowRight, AudioLines, Check, CheckCircle2, ChevronRight, Copy, FileAudio2, FileText, Globe2, Headphones, Loader2, Plus, Settings2, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUDIO_ACCEPT, MAX_DURATION_SECONDS, MODEL, type TranscriptionMode } from "@/config/constants";
import { apiRequest } from "@/lib/api-client";
import { validateAudio } from "@/lib/audio-validation";
import { downloadName, formatBytes, formatDuration, transcriptStats } from "@/lib/file-utils";
import type { Settings } from "@/types/api";
const SettingsDialog = dynamic(() => import("@/components/settings/settings-dialog"), { ssr: false });

export function Workspace() {
  const [settings, setSettings] = useState<Settings>({ configured: false, status: "not_configured", model: MODEL });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [mode, setMode] = useState<TranscriptionMode>("smart");
  const [transcript, setTranscript] = useState("");
  const [original, setOriginal] = useState("");
  const [resultName, setResultName] = useState("transcript");
  const [hasResult, setHasResult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion();
  const stats = transcriptStats(transcript);
  useEffect(() => { void apiRequest<Settings>("/api/settings").then(setSettings).catch(e => setError(e.message)); return () => request.current?.abort(); }, []);
  useEffect(() => {
    if (!file) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(file); setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) { if (transcript) { e.preventDefault(); } }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [transcript]);
  const selectFile = useCallback((files: FileList | File[]) => {
    if (request.current || !files.length) return;
    if (files.length > 1) { setError("Choose one recording at a time."); return; }
    const selected = files[0], problem = validateAudio(selected);
    setError(problem ?? ""); setNotice("");
    if (!problem) { setFile(selected); setDuration(null); }
  }, []);
  async function start() {
    if (!file || request.current) return;
    if (hasResult && transcript && !window.confirm("Replace the current transcript? Download or copy it first if you want to keep it.")) return;
    setBusy(true); setError(""); setNotice("");
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 11 * 60 * 1000);
    const form = new FormData(); form.append("audio", file); form.append("mode", mode);
    try {
      const result = await apiRequest<{ transcript: string }>("/api/transcribe", { method: "POST", body: form, signal: controller.signal });
      if (controller.signal.aborted) return;
      setTranscript(result.transcript); setOriginal(result.transcript); setResultName(file.name); setHasResult(true); setCopied(false);
      setNotice("Your transcript is ready. Review and edit it below.");
      setTimeout(() => editor.current?.focus(), 100);
    } catch (e) {
      if (controller.signal.aborted) setNotice(controller.signal.reason === "timeout" ? "This request timed out. Try a shorter recording." : "Request cancelled. Google may finish a request already received.");
      else setError(e instanceof Error ? e.message : "Unable to transcribe this recording.");
    } finally { clearTimeout(timeout); request.current = null; setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(transcript); setCopied(true); } catch { setError("Clipboard access was blocked. Select the transcript and copy it manually."); editor.current?.focus(); editor.current?.select(); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([transcript], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = downloadName(resultName); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reset() {
    if (transcript && !window.confirm("Start fresh? Your transcript will be cleared. Copy or download it first to keep it.")) return;
    setFile(null); setDuration(null); setTranscript(""); setOriginal(""); setHasResult(false); setError(""); setNotice(""); setCopied(false);
  }
  return <>
    <a href="#workspace" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">Skip to workspace</a>
    <header className="border-b border-border bg-white/70"><nav aria-label="Main navigation" className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-10">
      <a href="/" className="flex items-center gap-2.5 text-xl font-semibold tracking-[-0.7px]" aria-label="AudioText home"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white"><AudioLines size={21} /></span>AudioText<span className="ml-1 rounded border border-border px-1.5 py-0.5 text-[9px] font-medium tracking-widest text-muted-foreground">LOCAL</span></a>
      <div className="flex items-center gap-5 sm:gap-8"><a href="#workspace" className="hidden border-b-2 border-primary py-7 text-sm font-medium sm:block">Workspace</a><span className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className={`size-1.5 rounded-full ${settings.status === "connected" ? "bg-emerald-600" : "bg-stone-400"}`} />{settings.status === "connected" ? "API connected" : settings.configured ? "API key saved" : "Connect your API key"}</span><Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}><Settings2 />Settings</Button></div>
    </nav></header>
    <main id="workspace" className="mx-auto max-w-[1080px] px-5 pb-14 pt-12 sm:px-10 sm:pt-16">
      <motion.section initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mb-10 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-medium text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />A little less typing. A little more clarity.</div>
        <h1 className="text-[36px] font-medium leading-[1.15] tracking-[-1.8px] sm:text-[49px]">Words from your audio<span className="text-primary">.</span></h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-muted-foreground sm:text-[15px]">Upload a recording. Get an accurate transcript.<br className="hidden sm:block" /> No complicated workflow.</p>
      </motion.section>
      <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-medium"><span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] text-white">1</span>Your recording<span className="mx-1 text-border">/</span><span className="text-muted-foreground">Make room for your words</span></div><span className="hidden text-[11px] text-muted-foreground sm:block">One file. A fresh start.</span></div>
      <section aria-label="Audio upload and transcription" className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_4px_24px_-16px_#34334430]">
        <div className="p-5 sm:p-7">
          {!file ? <div onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files); }} className={`flex min-h-[236px] flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-[#d6d5df] bg-[#fbfafc]"}`}>
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-[#e6e4f0] bg-white text-primary shadow-sm"><Upload size={21} strokeWidth={1.6} /></div>
            <h2 className="text-base font-medium tracking-tight">Drop your recording here</h2><p className="mt-1.5 text-xs text-muted-foreground">or choose a file from your device</p>
            <Button variant="outline" size="sm" className="mt-4 bg-white" onClick={() => input.current?.click()}>Browse files<Plus size={14} /></Button>
            <p className="mt-4 text-[10px] tracking-wide text-muted-foreground">MP3, WAV, M4A, FLAC, OGG, WebM <span className="mx-1">·</span> Up to 50 MB / 30 min</p>
          </div> : <div className="rounded-xl border border-border bg-background p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><FileAudio2 size={22} /></div><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium">{file.name}</h2><p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)}{duration !== null && ` · ${formatDuration(duration)}`} · Ready to transcribe</p></div><Button disabled={busy} variant="ghost" size="icon" aria-label="Remove audio file" onClick={() => { setFile(null); setDuration(null); setError(""); }}><X /></Button></div>
            {audioUrl && <audio key={audioUrl} controls preload="metadata" src={audioUrl} aria-label="Audio preview" onLoadedMetadata={e => { const seconds = e.currentTarget.duration; if (Number.isFinite(seconds)) { setDuration(seconds); if (seconds > MAX_DURATION_SECONDS) setError("This recording is longer than 30 minutes. Trim it before uploading."); } }} onError={() => setNotice("Your browser cannot preview this format. The server will validate the audio before transcription.")} />}
          </div>}
          <input ref={input} type="file" accept={AUDIO_ACCEPT} aria-label="Choose audio file" className="sr-only" tabIndex={-1} onChange={e => { if (e.target.files) selectFile(e.target.files); e.target.value = ""; }} />
          <div className="mt-6 grid gap-6 sm:grid-cols-[1.25fr_1fr]">
            <fieldset disabled={busy}><legend className="mb-2.5 text-xs font-medium">Transcription style</legend><div className="grid grid-cols-2 gap-2">{(["smart", "verbatim"] as const).map(value => <label key={value} className={`relative cursor-pointer rounded-lg border px-3 py-3 transition-colors ${mode === value ? "border-primary/50 bg-primary/5" : "border-border hover:bg-background"}`}><input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="peer sr-only" /><span className="flex items-center gap-2 text-xs font-medium peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">{value === "smart" ? <Sparkles size={14} className="text-primary" /> : <AudioLines size={14} className="text-primary" />}{value === "smart" ? "Smart" : "Verbatim"}{mode === value && <CheckCircle2 size={13} className="ml-auto text-primary" />}</span><span className="mt-1.5 block text-[10px] leading-4 text-muted-foreground">{value === "smart" ? "Clean, polished, easy to read" : "Every word, just as spoken"}</span></label>)}</div></fieldset>
            <div><p className="mb-2.5 text-xs font-medium">Recording language</p><div className="flex h-[74px] items-center gap-3 rounded-lg border border-border px-4"><Globe2 size={17} className="text-muted-foreground" /><div><p className="text-xs font-medium">Detect automatically</p><p className="mt-1.5 text-[10px] text-muted-foreground">Your words, in their original language</p></div></div></div>
          </div>
        </div>
        <div className="flex flex-col gap-4 border-t border-border bg-[#fdfdfc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck size={15} />No recording or transcript saved by AudioText.</p><Button className="sm:min-w-48" disabled={busy || !file || !settings.configured || (duration !== null && duration > MAX_DURATION_SECONDS)} onClick={() => void start()}>{busy ? <><Loader2 className="animate-spin" />Transcribing…</> : <>Transcribe audio<ArrowRight /></>}</Button></div>
      </section>
      {!settings.configured && <button onClick={() => setSettingsOpen(true)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground"><span className="text-primary">First time here?</span> Add your Gemini API key to get started.<ChevronRight size={13} /></button>}
      {busy && <div role="status" className="mt-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><Loader2 className="size-4 animate-spin text-primary" /><div className="flex-1"><p>Turning your recording into words…</p><p className="mt-1 text-xs text-muted-foreground">Uploading and transcribing. Longer recordings can take a few minutes.</p></div><Button variant="ghost" size="sm" onClick={() => request.current?.abort()}>Cancel</Button></div>}
      {error && <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="flex-1">{error}</p><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
      {notice && <p role="status" className="mt-4 text-center text-xs leading-6 text-muted-foreground">{notice}</p>}
      <section aria-labelledby="transcript-heading" className="mt-9"><div className="mb-4 flex items-center justify-between gap-2"><h2 id="transcript-heading" className="flex items-center gap-2 text-xs font-medium"><span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${hasResult ? "bg-primary text-white" : "border border-border text-muted-foreground"}`}>2</span>Your transcript</h2>{hasResult && <Button variant="ghost" size="sm" disabled={busy} onClick={reset}><Plus />New transcription</Button>}<span className="text-[11px] text-muted-foreground">{hasResult ? "Yours to make your own" : "Ready when you are"}</span></div>
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          {!hasResult ? <div className="flex min-h-[210px] flex-col items-center justify-center px-5 py-8 text-center"><FileText size={26} strokeWidth={1.3} className="mb-3 text-[#a2a0af]" /><h3 className="text-sm font-medium">Your words will land here.</h3><p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">Upload a recording above. Once it’s transcribed,<br className="hidden sm:block" /> you can edit, copy, and take it with you.</p></div> : <><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3"><span className="text-[11px] text-muted-foreground">{transcript !== original ? "Edited locally · not saved" : "Transcript ready · not saved"}</span><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={!transcript} onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button><Button variant="outline" size="sm" disabled={!transcript} onClick={download}><ArrowDownToLine />Download TXT</Button></div></div><textarea ref={editor} aria-label="Transcript editor" value={transcript} onChange={e => { setTranscript(e.target.value); setCopied(false); }} className="min-h-[300px] w-full border-0 bg-transparent px-6 py-5 text-sm leading-7 outline-offset-[-3px]" spellCheck placeholder="Your transcript is empty. You can type here." /><div className="flex items-center justify-between border-t border-border px-5 py-3"><span className="text-[11px] text-muted-foreground">{stats.words} words <span className="mx-2">·</span> {stats.characters} characters</span><Button variant="ghost" size="sm" disabled={!transcript} onClick={() => { if (window.confirm("Clear this transcript? This cannot be undone.")) setTranscript(""); }}>Clear transcript</Button></div></>}
        </div>
      </section>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-2"><Headphones size={14} />Made for real conversations</span><span className="flex items-center gap-2"><Globe2 size={14} />Automatic language detection</span><span className="flex items-center gap-2"><FileText size={14} />Your text, your way</span></div>
    </main>
    <footer className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-6 text-[10px] text-muted-foreground"><span>AudioText <span className="mx-2">/</span> A clearer way from voice to text.</span><span>Powered by Gemini <span className="mx-2">·</span> Stored locally. Processed by Google.</span></footer>
    {settingsOpen && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSettings={setSettings} />}
  </>;
}
