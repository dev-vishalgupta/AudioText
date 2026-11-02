# AudioText

A local, single-user transcription workspace built with Next.js. Upload a recording, transcribe it with your own Gemini API key, then edit, copy, or download the text. No accounts, subscriptions, database, or transcript history.

## Run on this computer

Double-click **Start-AudioText.cmd**, or open PowerShell in this project and run:

```powershell
npm run dev
```

Open **http://127.0.0.1:3100**. Keep the terminal open; press Ctrl+C to stop.

The installed Node.js version is 22.15.0. Dependencies are already installed in a writable local runtime. This machine blocks shell writes inside the Documents project folder, so `.audiotext/local-runtime.json` points to the installed runtime under the second workspace. The launcher synchronizes source files before each command; during development it watches `src` and `public`. Restart after changing configuration or deleting/renaming source files. This machine-specific path is ignored by Git. No Windows protection settings were changed. Port 3100 avoids another application already using 3000.

If the runtime folder is moved or deleted, either update the local path or follow the clean installation instructions below. Keep the runtime folder for this installation.

## Clean installation on another computer

Prerequisites: Node.js 22.15+ (Node 22 LTS recommended), npm 10+, a modern browser, internet access to Google, and a Gemini API key. Windows also needs Windows PowerShell and `icacls` for OS-backed credential protection. Use a directory where Node can write dependencies and build output.

```powershell
npm ci
npm run dev
```

No environment file is required on Windows with the default local address. `.env.example` documents optional settings. If needed, copy it to `.env.local`; never commit credentials. On a fresh checkout the launcher runs directly in the project directory when `node_modules` is present.

## Configure your API key

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Open **Settings** in AudioText.
3. Paste your key and select **Save API key**.
4. Select **Test connection**. This checks access to the exact model’s metadata without a paid transcription request.
5. Upload a recording and select **Transcribe audio**.

The saved key is never returned to the browser. Show/hide reveals only a key you are currently typing. Saving or closing clears that input. Test connection verifies authentication and model metadata access; successful audio inference and available inference quota still depend on your Google project. Removing a key removes the saved ciphertext. Removal does not cancel a transcription that already retrieved the key.

Standard and authorization keys are accepted without assuming a prefix or an alphanumeric-only format. The field preserves long pasted keys; server validation limits the value to 4,096 visible ASCII characters, with no internal whitespace. Google validates the credential through Test connection. If you previously used the original 256-character field, refresh and paste the complete key again. See [Google's API key types](https://ai.google.dev/gemini-api/docs/api-key).

## Features

- Warm, responsive workspace with Geist typography, accessible controls, reduced-motion support, keyboard focus, and a focus-trapped settings dialog.
- Drag and drop or file picker, file size and duration, browser audio playback, and removal independent of the transcript.
- Smart and Verbatim transcription with automatic language detection.
- Editable transcript, local edit indicator, Unicode-aware counts, clipboard copy, safe TXT filename, and reset confirmation.
- Explicit loading, cancellation, missing key, invalid input, quota, model, empty output, and network error states.
- No browser credential storage and no permanent recording/transcript storage by AudioText.

## Model and formats

The app uses **`gemini-3.5-transcribe`**, with no fallback model. Google’s [transcription guide](https://ai.google.dev/gemini-api/docs/transcribe) and the installed official SDK were checked during implementation on 3 November 2026.

| Mode | Behavior |
| --- | --- |
| Smart | Removes disfluencies and applies readable formatting. Spoken corrections may be resolved. |
| Verbatim | Preserves spoken wording, repetitions, fillers, and identifiable false starts. |

AudioText does not request translation, summarization, speaker labels, or timestamps. Always review generated transcripts for accuracy.

Accepted containers: **MP3, WAV, M4A, FLAC, OGG, and audio-only WebM**. Limits: **50 MiB and 30 minutes per recording**. Google documents these formats and a longer unary model limit; the app deliberately enforces its smaller limits. Filename, reported MIME, binary signature, audio metadata, and duration are checked server-side. Video tracks and unreadable duration are rejected. This is metadata validation, not a full decode of every audio frame; Google may still reject a corrupt stream. Browser playback support varies. Some WebM recordings omit duration; re-export these as WAV or MP3.

## Technology and structure

Next.js 16.4.4 App Router, React 19.3.1, strict TypeScript 7.0.2, Tailwind CSS 4.3.3, shadcn/ui-style source components with Radix primitives, Lucide React, Framer Motion, Google Gen AI SDK 2.32.0, Zod 4, music-metadata 12, Vitest 5, and Playwright 1.64. Exact resolved versions are in `package-lock.json`. Geist is bundled locally; no font request is sent to a third party.

```text
src/
  app/
    layout.tsx, page.tsx, globals.css
    api/settings/route.ts
    api/settings/test-connection/route.ts
    api/transcribe/route.ts
  components/
    workspace.tsx
    settings/settings-dialog.tsx
    ui/button.tsx, dialog.tsx
  config/constants.ts
  lib/audio-validation.ts, api-client.ts, file-utils.ts, utils.ts
  server/
    credentials/encryption.ts, credential-store.ts
    services/audio.ts, transcription-service.ts
    errors.ts, http.ts
  types/api.ts
tests/
  core.test.ts, api.test.ts, fixtures.ts, server-only.ts
  e2e/workspace.spec.ts
scripts/run-local.mjs
Start-AudioText.cmd
```

## Credential security and privacy

**Local mode is the implemented deployment.** Next.js route handlers act as the local backend. The launch commands bind to `127.0.0.1`; API routes require the configured loopback Host, and mutations require an exact matching Origin. Cross-site requests are rejected. Do not expose this single-user server through a public reverse proxy, tunnel, LAN binding, shared desktop login, or multi-user hosting service.

On Windows, keys are encrypted using **DPAPI CurrentUser** and stored at `%LOCALAPPDATA%\AudioText\credential.json`. Directory inheritance is removed and access granted to the current Windows account. Updates use a private temporary ciphertext file and an atomic rename. No encryption master key is stored next to the credential. An administrator or malware running as the same Windows user can still access that user’s secrets; DPAPI is not protection against a compromised account.

On macOS/Linux, the store uses AES-256-GCM with random nonces and an externally supplied 32-byte base64 `AUDIOTEXT_MASTER_KEY`. Inject it from an OS secret manager or protected service environment, keep it separate from the ciphertext, and retain it across restarts. Saving fails closed when it is missing. Files and directories use 0600/0700 modes. This fallback’s encryption is unit-tested; its full OS deployment was not tested on this Windows machine.

Keys pass through the browser only while entered and sent to the local endpoint. They are not embedded in client bundles, persisted in browser storage, echoed in responses, logged, or used as shared credentials. Server modules are marked `server-only`. Errors use fixed safe messages rather than upstream text.

Recordings remain in process memory during a request and are sent to Google using the Files API. AudioText deletes the uploaded file in a `finally` block when its resource name is known, including after inference errors. Interactions use `store: false`. If the server crashes, an upload completes without returning its name, or deletion fails, Google’s own Files API expiry applies; instant deletion cannot be guaranteed. Google processing, billing, and data-use policies still apply. See [Files API](https://ai.google.dev/gemini-api/docs/files) and [pricing/data-use information](https://ai.google.dev/gemini-api/docs/pricing).

Transcripts live only in page state. Reloading or closing the page loses them; copy or download first. Edited text is not sent back to Google. OS memory/swap and browser memory are outside the app’s secure-erasure guarantees. Credential removal unlinks the encrypted file; it cannot guarantee erasure from SSD snapshots/backups.

## API and processing

| Endpoint | Purpose |
| --- | --- |
| `GET /api/settings` | Configured flag, last connection status, model; never the key |
| `POST /api/settings` | Validate JSON and persist the key encrypted |
| `DELETE /api/settings` | Remove the saved credential |
| `POST /api/settings/test-connection` | Check the stored key against model metadata |
| `POST /api/transcribe` | Multipart `audio` and `mode` (`smart` or `verbatim`) |

Success responses include `success: true`; transcription adds `transcript` and `model`. Failures contain `success: false` and `error: { code, message }`. Settings bodies are capped at 16 KiB. Multipart bodies are bounded while read at 50 MiB plus 64 KiB of envelope overhead, independent of Content-Length. Requests are not saved to disk. Buffering a large multipart upload temporarily needs multiple in-memory copies; provision several hundred MiB of free memory. One transcription is allowed at a time per local server process.

Upload/processing waits are bounded; the full provider stage has a ten-minute deadline. Cancel aborts the browser request and propagates the cancellation signal where supported. It cannot guarantee Google stops work or avoids charging for an accepted request. There is no fake percentage progress: the interface displays an indeterminate processing state. Application-level retries do not automatically repeat billable inference.

## Quotas and deployment

Google quota is project-specific and varies by model and usage tier; it is not a guaranteed fixed number per API key. Check [active rate limits](https://aistudio.google.com/rate-limit) and [Google’s quota documentation](https://ai.google.dev/gemini-api/docs/rate-limits). HTTP 429 reports rate/quota exhaustion without exposing provider payloads. AudioText does not promise free transcription or unlimited usage.

Production-optimized **local** build:

```powershell
npm run build
npm run start
```

The app uses webpack for reproducible Windows builds. Production mode means a compiled local server, not a multi-tenant hosted service.

**Vercel/serverless deployment is intentionally not enabled.** A 50 MiB multipart body, long request runtime, and private durable filesystem are not portable across serverless platforms. A future hosted version requires authenticated user isolation, per-user ciphertext records, KMS/secret-manager encryption, durable private storage, bounded/streamed uploads or presigned object uploads, background jobs, deletion enforcement, HTTPS/CSRF protections, rate limits, and user-owned credential lookup. Those are a separate production strategy, not capabilities this MVP claims to provide. Never deploy the current store as a shared credential pool.

## Testing

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Tests use fake keys and mocked Google responses; no paid API request is required. Unit/integration coverage includes binary/file/duration validation, filename safety, Unicode counts, transcript formatting, authenticated encryption, real Windows DPAPI, settings save/read/delete, origin and size checks, safe errors, both SDK mode configurations, cancellation, and upload cleanup. Browser tests exercise settings/show-hide, upload, responsive widths, transcript editing, real browser clipboard, TXT file contents, rejection/error states, and cancellation.

Playwright uses installed Chrome by default and starts an isolated local production server on port 3100; that port must be free. For Edge, set `PLAYWRIGHT_CHANNEL=msedge` in your shell. To use a bundled Chromium, adjust the channel setting and run `npx playwright install chromium`. Windows credential tests must run under the owning account; sandbox identities intentionally lose access after owner-only ACLs are applied. Run builds and tests sequentially against a runtime.

See `VERIFICATION.md` for the results recorded for this implementation. The saved user key has now passed the actual model-access check, and real Smart and Verbatim requests succeeded with a short generated English speech sample. This verifies that the pipeline works; it does not establish accuracy across all languages, formats, or recordings. One initial Verbatim request failed and its manual retry succeeded. Automated tests still require no real key and use no paid inference.

## Troubleshooting

- **Port occupied:** Stop the other AudioText instance, or set both `PORT` and `AUDIOTEXT_ORIGIN` to a matching loopback port. The default is `127.0.0.1:3100`.
- **Origin rejected:** Use the exact printed URL, including `127.0.0.1` rather than `localhost`, unless you explicitly changed the origin setting.
- **Windows ENOENT while writing existing directories:** Move the checkout to a directory writable by Node, or retain this installation’s configured runtime. Do not disable Windows security to use the app.
- **Dependency registry timeouts:** Check your connection, proxy, and IPv6 routing. The existing installation is complete; launching does not need npm registry access.
- **Google connection timeouts:** The server prefers IPv4 because this machine's automatic Node network routing timed out before authentication. Set `AUDIOTEXT_NETWORK_FAMILY=auto` only if your network requires automatic/IPv6 routing. This changes Node's process-wide DNS order and address-family selection; it does not disable TLS or certificate verification.
- **Invalid key or access denied:** Replace the saved key; confirm its Google project, API restrictions, and model access.
- **Quota exceeded:** Wait, reduce request frequency, or review billing and quota in AI Studio.
- **Credential locked/corrupt:** Remove the saved credential in Settings and save a new one under your current OS account. DPAPI ciphertext is not portable between Windows users.
- **Unreadable audio/duration:** Re-export to a standard audio-only WAV or MP3. Split long recordings and keep each below both limits.
- **No audio preview:** Your browser may lack the codec; metadata validation and Google may still accept the recording.
- **Clipboard blocked:** Use the editor’s manual select/copy fallback. Clipboard access works on the trusted loopback address.
- **Changed dependencies in the source folder:** Re-run `npm ci` in the configured runtime or move to a normal writable checkout. The source watcher does not install packages.
