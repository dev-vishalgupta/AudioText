import "server-only";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, userInfo } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { decryptCredential, encryptCredential } from "./encryption";
import { AppError } from "@/server/errors";
import type { ConnectionStatus, Settings } from "@/types/api";
import { MODEL } from "@/config/constants";
const exec = promisify(execFile);
const recordSchema = z.object({ scheme: z.enum(["dpapi", "aes-gcm"]), value: z.string().min(1) });
let queue: Promise<unknown> = Promise.resolve();
let status: ConnectionStatus = "configured";
function directory() { return process.env.AUDIOTEXT_DATA_DIR || (process.platform === "win32" ? join(process.env.LOCALAPPDATA || homedir(), "AudioText") : join(homedir(), ".local", "share", "audiotext")); }
function filename() { return join(directory(), "credential.json"); }
function serial<T>(fn: () => Promise<T>): Promise<T> { const job = queue.then(fn, fn); queue = job.catch(() => {}); return job; }
async function readRecord() {
  try { return recordSchema.parse(JSON.parse(await readFile(filename(), "utf8"))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw new AppError("CREDENTIAL_LOCKED", "Unable to read the encrypted credential. Remove it and save your API key again.", 500); }
}
export async function getCredential() {
  await queue;
  const record = await readRecord();
  if (!record) throw new AppError("MISSING_API_KEY", "Add your Gemini API key in Settings before transcribing.", 401);
  return decryptCredential(record);
}
export async function getSettings(): Promise<Settings> {
  await queue;
  try {
    const configured = (await readRecord()) !== null;
    return { configured, status: configured ? status : "not_configured", model: MODEL };
  } catch {
    // Keep Remove/Replace available if a saved record is corrupt or unreadable.
    return { configured: true, status: "connection_failed", model: MODEL };
  }
}
export function setConnectionStatus(value: ConnectionStatus) { status = value; }
export function saveCredential(value: string) {
  return serial(async () => {
    const encrypted = await encryptCredential(value);
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    if (process.platform === "win32") {
      const account = `${process.env.USERDOMAIN || process.env.COMPUTERNAME}\\${userInfo().username}`;
      await exec("icacls.exe", [directory(), "/inheritance:r", "/grant:r", `${account}:(OI)(CI)F`], { windowsHide: true });
    } else await chmod(directory(), 0o700);
    const temp = join(directory(), `.${randomUUID()}.tmp`);
    try { await writeFile(temp, JSON.stringify(encrypted), { mode: 0o600, flag: "wx" }); await rename(temp, filename()); }
    finally { await rm(temp, { force: true }); }
    status = "configured";
  });
}
export function deleteCredential() { return serial(async () => { await rm(filename(), { force: true }); status = "not_configured"; }); }
