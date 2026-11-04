"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MODEL } from "@/config/constants";
import { hasApiKey, saveApiKey, removeApiKey } from "@/lib/credentials";
import { safeError } from "@/lib/errors";
import type { Settings } from "@/types/api";

export function useCredentials() {
  const [settings, setSettings] = useState<Settings>({ configured: false, status: "not_configured", model: MODEL });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { const configured = await hasApiKey(); setSettings({ configured, status: configured ? "configured" : "not_configured", model: MODEL }); }
    catch (e) { setError(safeError(e).message); setSettings({ configured: false, status: "not_configured", model: MODEL }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("audiotext-credential-change");
      channel.current.onmessage = () => { if (!busy.current) void refresh(); };
    }
    return () => channel.current?.close();
  }, [refresh]);
  async function action(kind: "save" | "test" | "remove", key = "") {
    if (busy.current) return;
    busy.current = true; setError("");
    try {
      if (kind === "remove") {
        await removeApiKey();
        setSettings({ configured: false, status: "not_configured", model: MODEL });
        channel.current?.postMessage("changed");
        return;
      }
      if (kind === "save") { await saveApiKey(key); channel.current?.postMessage("changed"); }
      setSettings({ configured: true, status: "testing", model: MODEL });
      const { testConnection } = await import("@/lib/gemini");
      await testConnection();
      setSettings({ configured: true, status: "connected", model: MODEL });
    } catch (e) {
      const failure = safeError(e);
      const configured = await hasApiKey().catch(() => false);
      const status = failure.code === "INVALID_API_KEY" ? "invalid_key" : failure.code === "QUOTA_EXCEEDED" ? "quota_exceeded" : ["SERVICE_UNAVAILABLE", "MODEL_UNAVAILABLE"].includes(failure.code) ? "service_unavailable" : "connection_failed";
      setSettings({ configured, status: configured ? status : "not_configured", model: MODEL });
      setError(failure.message);
      throw failure;
    } finally { busy.current = false; }
  }
  return { settings, loading, error, refresh, action };
}
export type Credentials = ReturnType<typeof useCredentials>;
