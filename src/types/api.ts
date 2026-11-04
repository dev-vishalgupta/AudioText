export type ConnectionStatus = "not_configured" | "configured" | "testing" | "connected" | "invalid_key" | "quota_exceeded" | "connection_failed" | "service_unavailable";
export type Settings = { configured: boolean; status: ConnectionStatus; model: string };
