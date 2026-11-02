import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { AppError } from "@/server/errors";
export function encryptAes(value: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Invalid master key length");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptAes(value: string, key: Buffer): string {
  const data = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
function dpapi(value: string, decrypt: boolean): Promise<string> {
  // Secret bytes travel over stdin/stdout only, never in arguments or logs.
  const script = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::" + (decrypt ? "Unprotect" : "Protect") + "($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))";
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Credential protection timed out")); }, 15_000);
    let out = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { out += chunk; });
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timer); reject(new Error("Credential protection unavailable")); });
    child.on("close", code => { clearTimeout(timer); if (code === 0 && out.trim()) resolve(out.trim()); else reject(new Error("Credential protection failed")); });
    child.stdin.on("error", () => { /* Close event handles a stopped helper. */ });
    child.stdin.end(value);
  });
}
export async function encryptCredential(value: string) {
  if (process.platform === "win32") return { scheme: "dpapi" as const, value: await dpapi(Buffer.from(value).toString("base64"), false) };
  const key = masterKey(); return { scheme: "aes-gcm" as const, value: encryptAes(value, key) };
}
export async function decryptCredential(data: { scheme: string; value: string }) {
  if (data.scheme === "dpapi" && process.platform === "win32") return Buffer.from(await dpapi(data.value, true), "base64").toString("utf8");
  if (data.scheme === "aes-gcm" && process.platform !== "win32") return decryptAes(data.value, masterKey());
  throw new AppError("CREDENTIAL_LOCKED", "This credential belongs to another operating system or user. Remove it and save a new API key.", 500);
}
function masterKey() {
  const key = Buffer.from(process.env.AUDIOTEXT_MASTER_KEY ?? "", "base64");
  if (key.length !== 32) throw new AppError("SECURE_STORAGE_UNAVAILABLE", "Provide a 32-byte AUDIOTEXT_MASTER_KEY through your OS secret manager before saving a key on this platform.", 503);
  return key;
}
