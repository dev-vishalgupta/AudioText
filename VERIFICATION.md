# Verification — 4 November 2026

## Established deployment failure

The existing Vercel deployment `J6nRF7Z3QJy9HjKL3n9uJp6cpkxs` for commit `8c72217` successfully compiled, then failed output validation:

> Builder returned invalid maxDuration value for Serverless Function "api/transcribe". Serverless Functions must have a maxDuration between 1 and 300 for plan hobby.

Read from the authenticated Vercel Deployment Overview. The original route declared `maxDuration = 660`; this was confirmed in Git. The old architecture also required loopback origins and OS/filesystem credentials and tried to proxy up to 50 MiB through Functions. Those are separate runtime incompatibilities, not invented compilation errors.

The new architecture has no application API routes or Functions. The static Next.js UI uses IndexedDB and the official Google browser SDK directly.

## Current local validation

Validation used an isolated writable copy because Windows rejects shell and Git metadata writes inside this Documents checkout. Source was synchronized from this project. No OS security settings were changed.

| Check | Result |
| --- | --- |
| Production build | Passed with `npm run build`, Next 16.4.4 / webpack, TypeScript 6.0.3 |
| Emitted routes | Only static `/` and `/_not-found`; no application APIs |
| TypeScript | `npm run typecheck` passed |
| ESLint | `npm run lint` passed, 0 errors; one existing PostCSS anonymous-export warning |
| Unit/integration | 16 tests passed across 3 files |
| Playwright | 24 passed, 2 intentionally skipped duplicate mobile checks (55.8 seconds); desktop and mobile Chromium against production build, including real browser process restart |
| Dependency audit | `npm audit --omit=dev --json`: 0 reported vulnerabilities |
| Browser CORS | Real Google resumable-upload initiation endpoint returned readable HTTP 400 to a deliberate invalid key; no real key/audio sent |
| Upload boundary | Complete 50 MiB WAV uploaded by actual browser SDK to mocked Google; captured upload bytes equal 52,428,800 |
| Removed APIs | POST /api/settings, /api/settings/test-connection and /api/transcribe return 404 and do not echo submitted dummy key |
| Artifact audit | No old credential-file/DPAPI/master-key strings, fixture credentials or key-pattern matches in production static assets |
| Source audit | No server-only/node imports, localhost origins, credential logs, session/localStorage, unsafe HTML or server credential persistence in src |

Browser tests cover save with automatic test, fixed masking and show/hide only for typed text, reload, update, removal, invalid-key state, missing IndexedDB and retry, browser-process restart using a persistent profile, Smart/Verbatim serialization, audio validation, quota/network/service/empty-output failures, cancellation, duplicate prevention, responsive layout, copy, edit and TXT content.

Provider calls are mocked at HTTP boundaries while exercising the installed SDK. Assertions check credential headers are restricted to Google, keys are absent from URLs/UI/console logs, and uploads are deleted after success or failure. Safe errors do not include provider messages. A unit regression rejects a premature final upload response, preventing transcription of a partial upload. No actual user key was read, logged, copied into fixtures or used for paid inference in this migration.

The first browser run exposed an incorrect test mock parsing SDK binary chunks as JSON; the corrected tests inspect paths instead. Playwright's in-memory fixture transport also rejects buffers at the 50 MiB boundary, so the large-file test uses a generated file path. These were test harness problems, not production upload limits.

## Limits of this verification

- A mocked 50 MiB upload verifies the application/browser path and full byte transfer; it is not a paid 50 MiB Google transcription.
- Real Google inference was tested in the old local architecture on 3 November. It is not claimed as live validation of this new browser deployment.
- Browser persistence is tested across a full Chrome process restart. Browser eviction, profile resets and incognito semantics can still remove keys.
- Mobile coverage is Chromium emulation, not physical iOS/Safari. Real recordings in every codec/language were not exhaustively tested.
- IndexedDB is intentionally readable by same-origin scripts; it is not an encrypted secure vault.
- Production HTTPS deployment must be verified separately from these local checks. GitHub's existing Vercel integration is used after pushing main; the chat's final report records the observed deployment result.
