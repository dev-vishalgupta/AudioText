"use client";
import { useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import type { Settings } from "@/types/api";

export default function SettingsDialog({ open, onOpenChange, settings, onSettings }: { open: boolean; onOpenChange: (open: boolean) => void; settings: Settings; onSettings: (s: Settings) => void }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function action(kind: "save" | "test" | "remove") {
    if (busy) return;
    setBusy(kind); setError(""); setMessage("");
    try {
      const result = await apiRequest<Settings>(kind === "test" ? "/api/settings/test-connection" : "/api/settings", {
        method: kind === "remove" ? "DELETE" : "POST",
        ...(kind === "save" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key.trim() }) } : {}),
      });
      onSettings(result);
      setKey(""); setShow(false);
      setMessage(kind === "save" ? "API key saved securely. You can now test the connection." : kind === "remove" ? "API key removed." : "Connected. Your key can access the transcription model.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update settings.");
      try { onSettings(await apiRequest<Settings>("/api/settings")); } catch { /* Preserve last known configuration. */ }
    } finally { setBusy(null); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) { setKey(""); setShow(false); setMessage(""); setError(""); onOpenChange(value); } }}>
    <DialogContent><div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary/8 text-primary"><KeyRound size={21} /></div>
      <DialogTitle className="text-xl font-semibold tracking-tight">Make the connection.</DialogTitle>
      <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">Bring your own Gemini API key. AudioText uses it only for your recordings.</DialogDescription>
      <form className="mt-6" onSubmit={e => { e.preventDefault(); void action("save"); }}>
        <label className="mb-2 block text-sm font-medium" htmlFor="api-key">Gemini API key</label>
        <div className="relative"><input id="api-key" type={show ? "text" : "password"} autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder={settings.configured ? "Enter a new key to replace the saved key" : "Paste your API key"} className="h-12 w-full rounded-lg border border-border bg-background px-3 pr-12 text-sm" />
          <Button aria-label={show ? "Hide API key" : "Show API key"} type="button" variant="ghost" size="icon" className="absolute right-1 top-1" onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Create a key in <a className="inline-flex items-center gap-1 text-primary underline underline-offset-2" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio <ExternalLink size={11} /></a>, then paste and save it here.</p>
        <div className="mt-5 flex flex-wrap gap-2"><Button type="submit" disabled={!key.trim() || !!busy}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Check />}Save API key</Button><Button type="button" variant="outline" disabled={!settings.configured || !!busy || !!key.trim()} onClick={() => void action("test")}>{busy === "test" && <Loader2 className="animate-spin" />}Test connection</Button></div>
      </form>
      <div className="my-6 space-y-3 rounded-xl border border-border bg-background p-4 text-xs"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Connection</span><span role="status" className="font-medium">{busy === "test" ? "Testing connection…" : ({ not_configured: "Not configured", configured: "Saved · not tested", connected: "Connected", testing: "Testing connection", invalid_key: "Invalid API key", quota_exceeded: "API quota exceeded", connection_failed: "Connection failed" }[settings.status])}</span></div><div className="flex flex-wrap justify-between gap-2"><span className="text-muted-foreground">Model</span><code className="text-[11px]">{settings.model}</code></div></div>
      {message && <p role="status" className="mb-4 text-sm leading-6 text-emerald-800">{message}</p>}{error && <p role="alert" className="mb-4 text-sm leading-6 text-red-700">{error}</p>}
      <div className="flex gap-2.5 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>Your saved key stays encrypted on this computer. Recordings are sent to Google for transcription. Google’s API data terms apply.</p></div>
      {settings.configured && <Button variant="destructive" size="sm" className="mt-4 -ml-3" disabled={!!busy} onClick={() => void action("remove")}><Trash2 />Remove API key</Button>}
    </DialogContent>
  </Dialog>;
}
