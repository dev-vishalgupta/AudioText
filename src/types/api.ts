export type ConnectionStatus = "not_configured" | "configured" | "testing" | "connected" | "invalid_key" | "quota_exceeded" | "connection_failed";
export type Settings = { configured: boolean; status: ConnectionStatus; model: string };
export type ApiResult<T> = ({ success: true } & T) | { success: false; error: { code: string; message: string } };
