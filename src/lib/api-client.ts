import type { ApiResult } from "@/types/api";
export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  let body: ApiResult<T>;
  try { body = await response.json(); } catch { throw new Error("The local server returned an unreadable response. Try again."); }
  if (!body || body.success !== true) throw new Error(body && "error" in body ? body.error.message : "The request failed. Try again.");
  if (!response.ok) throw new Error("The request failed. Try again.");
  return body;
}
