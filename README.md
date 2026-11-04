# AudioText

A Next.js workspace for turning recordings into editable text using your own Gemini API key. Smart and Verbatim modes, audio preview, transcript editing, copy and TXT download remain available. No login, accounts, database, or transcript history.

## Local development

Use Node.js 22 LTS, npm, a modern browser with IndexedDB, and a writable checkout.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3100. The Windows launcher `Start-AudioText.cmd` runs the same command. Stop with Ctrl+C.

On this computer, Windows blocks shell writes under Documents. The ignored `.audiotext/local-runtime.json` points to a writable runtime with installed dependencies. `scripts/run-local.mjs` copies source there only for local commands; it does not run in Vercel builds. Restart development after configuration changes. Reinstall dependencies in the runtime if package files change. A normal checkout with node_modules needs no mirror.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Production start uses Next's default port 3000; pass `-- --port 3100` if desired. For the special local mirror use `npm run build:local`, `npm run start:local`, `npm run check:local`, `npm run test:local`, and `node scripts/run-local.mjs lint`.

## Vercel deployment

1. In Vercel, import the existing [dev-vishalgupta/AudioText](https://github.com/dev-vishalgupta/AudioText) repository, or open its existing Vercel project.
2. Select **Next.js**, repository root, production branch **main**, and Node.js **22.x**.
3. Use `npm ci` to install and `npm run build` to build; leave Output Directory at the framework default. These settings are included in `vercel.json`. Remove any old dashboard override pointing at a local launcher or custom output directory.
4. No Gemini key or AudioText environment variable is needed. Remove obsolete `AUDIOTEXT_ORIGIN`, `AUDIOTEXT_DATA_DIR`, `AUDIOTEXT_MASTER_KEY`, or network-family overrides if configured.
5. Deploy the updated main commit. Open the stable HTTPS production URL, save a key in Settings, then upload a short recording in each mode.
6. Refresh, close/reopen the browser using the same profile, and confirm the saved-key indicator remains. Test connection remains available.

Do not configure a shared deployment key or `NEXT_PUBLIC_` credential. Vercel only serves the application. No application API routes, filesystem credential writes, background companion process, or durable server state are required.

A successful build is not a verified live deployment. See [VERIFICATION.md](VERIFICATION.md) for the actual checks and remaining external verification.

## Save, update and remove your key

Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Open **Settings**, paste the complete key, and select **Save API key**. AudioText commits it to IndexedDB, clears the input, retrieves the saved key, and automatically checks access to **gemini-3.5-transcribe**. The check retrieves model metadata; it does not perform a paid transcription or guarantee remaining inference quota.

The full saved key is never loaded into the input or displayed. Show/hide applies only to newly typed text; a fixed masked indicator represents an existing credential. To update, enter another key and save. **Remove API key** deletes the IndexedDB record after its transaction completes. An already-running request can still finish with its in-memory credential; use Cancel as needed.

Saving and connecting are separate outcomes: an invalid key can remain saved with an invalid-key status so it can be updated or removed. A page reload restores **Saved · not tested**, not a false Connected status. Retrying storage checks recovers from temporarily blocked IndexedDB; failed persistence is never reported as a successful save.

Storage belongs to the **same browser profile and exact origin** (scheme, hostname and port). A stable production domain survives subsequent deployments. Different devices, browsers, incognito profiles, preview deployment URLs, custom domains, or localhost addresses do not share keys. Clearing site data, browser eviction, profile deletion, or private-session closure can remove them. There is no device synchronization. Old OS-encrypted credentials from the local version are not migrated or read; enter the key once in the new UI.

## Audio and model

The only model is **gemini-3.5-transcribe**, with its native Smart and Verbatim transcription modes; no fallback model, translation or summary is requested. Language is detected automatically. Review generated text for accuracy.

Supported containers: **MP3, WAV, M4A, FLAC, OGG and audio-only WebM**. Application limits are **50 MiB (52,428,800 bytes)** and **30 minutes**. The UI abbreviates the binary size as 50 MB. Filename, MIME type, signature, codec, channels, sample rate and duration are validated in the browser before uploading. Video tracks and unreadable duration are rejected. Metadata validation does not decode every frame; Google may still reject damaged audio. Re-export unsupported codec variants or duration-less WebM as WAV or MP3.

### Why uploads go directly to Google

[Vercel Functions limit request/response payloads to 4.5 MB](https://vercel.com/docs/functions/limitations). Their duration limits also make a long-running server proxy a poor fit here. The [official Google SDK supports browser File/Blob uploads](https://googleapis.github.io/js-genai/release_docs/classes/files.Files.html). AudioText uses that resumable Files API implementation directly over HTTPS, followed by the Interactions API. Audio and credentials never pass through a Vercel Function, so the application retains its 50 MiB limit without external object storage.

The browser SDK and model API are bundled locally. A fetch guard restricts traffic to Google's intended HTTPS host/API paths, forbids key query parameters and redirects, and omits cookies. The API key is sent in Google's request header only for provider operations. Each operation obtains the current credential from IndexedDB; configuration loading only checks record existence.

The upload/model requests have deadlines, inference has an eight-minute timeout, and the overall UI operation has an eleven-minute deadline. One transcription runs at a time per tab. Cancel aborts pending browser requests, but cannot undo work already accepted by Google. No automatic retry of billable inference is configured. Connection test uses a twenty-second deadline.

## Security and privacy

**IndexedDB is persistent storage, not a secure vault.** Same-origin malicious JavaScript, extensions with appropriate access, a compromised browser/profile or device can read a stored key. Encrypting it with a locally accessible key would not fix this. Only save a key on a browser/profile you trust; restrict and rotate it in Google AI Studio as appropriate.

The app never logs credentials, echoes them in application responses, puts them in URLs, embeds them in bundles, or stores them on Vercel. There are no settings or transcription endpoints; their old URLs return 404. A user can inspect their own provider request header in browser developer tools—client-side use cannot conceal a key from its owner or same-origin scripts.

CSP restricts connections to self and generativelanguage.googleapis.com, blocks frames and objects, and uses locally bundled fonts/scripts. Next's static rendering requires inline bootstrap scripts, so script-src includes unsafe-inline; production excludes unsafe-eval. HTTPS/HSTS, no-referrer, nosniff, frame denial, and restricted browser permissions are configured. There is no unsafe HTML rendering, external analytics, third-party script CDN, URL-fetch proxy, shared provider key, or billable backend endpoint to abuse. Origin checks and server rate limiting are unnecessary for removed mutating application endpoints. Provider quotas apply to each user's key; local controls are usability safeguards, not provider-side enforcement.

Recordings and transcripts are not persisted by AudioText. Audio is uploaded to Google, and temporary files are deleted in a finally block when their validated resource name is known. Deletion is best effort; if the tab closes, a response is lost, or cleanup fails, Google's [Files API expiry](https://ai.google.dev/gemini-api/docs/files) applies. Interactions use `store: false`. Google's processing, retention and billing terms still apply.

Text edits stay in page memory and are not sent to Google. Download or copy before closing/reloading. Removing a key does not revoke it at Google or securely erase OS backups/memory. Ordinary Vercel access logs may contain page requests, but never receive the credential or audio.

## Tests and implementation

- `src/lib/credentials.ts`: small native IndexedDB module; commit-aware save/remove, retrieval, existence, bounded initialization and safe storage failures.
- `src/hooks/use-credentials.ts`: restored configuration, connection status and cross-tab invalidation without transmitting the key.
- `src/lib/gemini.ts`: official SDK, provider-only networking, timeouts, exact model/modes, safe errors and remote file cleanup.
- `src/lib/audio-content.ts`: browser-compatible audio metadata validation.
- `tests/`: real SDK serialization over mocked HTTP, storage CRUD/error tests, audio and security checks.
- `tests/e2e/`: desktop Chrome/mobile emulation, browser process restart, storage failure/retry, UI workflow and full 50 MiB upload to mocked Google.

`npm run test:e2e` uses installed Chrome and starts a production build on port 3100. Build first and leave that port free; alternatively set `AUDIOTEXT_E2E_USE_RUNNING_SERVER=1` only for an already-running matching production build. `PLAYWRIGHT_CHANNEL` can select Edge. Automated tests use fake keys and mocked provider responses, never a user's key or paid inference. TypeScript 6 is used because the current Next ESLint parser rejects TypeScript 7.

## Troubleshooting

- **Storage unavailable:** Allow site data, disable restrictive private-mode policies or try a normal profile, then Retry storage. No temporary in-memory save is presented as persistent.
- **Saved key disappeared:** Check the exact origin/profile and whether site data was cleared. Deployment preview URLs each have independent storage.
- **Invalid key/model unavailable:** Replace the key and check its API restrictions, project and model access in AI Studio.
- **Network error:** Check internet access, browser extensions and policies blocking Google's HTTPS API. Local Node DNS settings no longer affect provider traffic.
- **Quota:** Wait or check Google project quota/billing. An accessible model does not guarantee inference quota.
- **Vercel 413 from an old deployment:** Confirm the deployed commit uses direct Google uploads; audio should never be POSTed to /api/transcribe.
- **Old local UI:** Stop the old server and start this checkout. Refresh the page before saving your key.
- **Unreadable audio/duration:** Re-export as standard WAV/MP3, or split into files within both limits.
- **Slow/large audio:** Keep the tab open and foregrounded. Browser suspension, limited memory, poor networks or provider limits can still interrupt work.
- **Port occupied:** Stop the old AudioText process or set PORT for local development. Different ports have separate key storage.
- **Windows write failures:** Use a writable checkout or the existing ignored local mirror; do not disable OS protections.
