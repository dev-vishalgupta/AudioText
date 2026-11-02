# Verification report — 3 November 2026

Source: `C:\Users\Vishal Gupta\Documents\ChatGPT\AudioText`.

Installed runtime: `C:\Users\Vishal Gupta\.codex\visualizations\2026\11\02\01a19e0f-7af4-7793-9195-257ae69cd415\audiotext`.

The launcher synchronizes source to the runtime because this machine rejects shell writes in Documents. The tested application code is the same source; dependencies, build output, browser reports, and screenshots live in the runtime. No other application or Windows security setting was changed.

| Check | Actual result |
| --- | --- |
| Dependency installation | 166 packages audited; 0 vulnerabilities reported at installation |
| Strict TypeScript | Passed standalone typecheck and final Next.js build typecheck |
| Vitest | 17 tests passed across 2 files; final run 5.76 seconds |
| Playwright | 10 tests passed; desktop Chrome and mobile Chrome emulating iPhone 13 dimensions; final run 11.7 seconds |
| Production build | Passed with Next.js 16.4.4 / webpack; page and all 3 API endpoints emitted |
| Production server startup | Passed; Playwright launched the compiled server on loopback port 3100 |
| Development server | `npm run dev` launched from the original project; page and actual settings endpoint returned HTTP 200 |
| Responsive visual inspection | Desktop and mobile screenshots inspected; no horizontal overflow in viewport assertions |
| Credential storage | Actual Windows DPAPI round trip and encrypted file save/read/delete passed under the owning account |
| Client artifact review | No test credential, DPAPI implementation, master-key variable, or credential-file reference found in generated static assets |
| Git secret exclusions | `.env.local` and `.audiotext/local-runtime.json` confirmed ignored |

Tests cover real WAV metadata and duration rejection, signature and MIME checks, safe filenames, Unicode counting, formatting, AES authentication/tamper resistance, real DPAPI, corrupt credential recovery, origin rejection, body size limits, safe error mapping, connection status, exact Smart/Verbatim SDK parameters, no interaction persistence, empty output, cancellation, and remote file cleanup with mocked SDK calls. Browser tests exercise actual clipboard and download contents; API responses are mocked for deterministic, unpaid testing.

Real HTTP checks additionally verify that settings expose only the permitted fields, invalid keys are rejected, and foreign origins are blocked. These checks run against the compiled Next.js server without API interception.

Initial failures were diagnosed and corrected: sandbox access after owner-only credential ACLs, an occupied port 3000, Windows clipboard line endings, Next.js’s additional accessibility alert, a test trying to click the visually hidden radio input instead of its visible label, and Next.js reconstructing the internal request URL with a different hostname. Origin protection now validates the actual inbound Host and browser Origin. The final results above supersede those initial runs.

## Not verified

- Initial run: no real Gemini API key was supplied. This limitation was partially resolved in the continuation below. Broad language/accuracy quality, quota/billing behavior, and all codec variants remain unverified.
- Format containers are validated with music-metadata; the automated audio fixture is WAV. Not every supported codec variant was tested with Google or every browser.
- Mobile coverage uses Chrome device emulation, not a physical phone or Safari.
- AES encryption was tested; macOS/Linux service deployment was not.
- No public/serverless deployment was performed or enabled.

The SDK adapter is implemented and typechecked against the official package and verified documentation. A successful short live sample is not a benchmark of real-world transcription accuracy.

## Continuation: working credentials and real transcription

The following problems were reproduced and corrected on 3 November 2026:

1. The server was stopped. It was restarted on `http://127.0.0.1:3100` and left available for the user.
2. Default Node routing to Google timed out (`ETIMEDOUT`). IPv4-first DNS plus disabled automatic family selection reached Google's API; this is now configured before constructing the SDK client. An environment override allows automatic routing when needed.
3. Passing upload-level `httpOptions` to SDK 2.32.0 replaced its resumable-upload defaults. The actual SDK constructed `/v1beta/upload/v1beta/files` and omitted required upload protocol headers. Removing that override preserves the correct `/upload/v1beta/files` endpoint and headers; the client-level timeout remains in effect.
4. The original credential regex rejected punctuation and the browser capped input at 256 characters. The input no longer truncates keys, and server validation accepts bounded printable ASCII key values without assuming Google's key syntax. A 16 KiB JSON envelope accommodates values up to 4,096 characters. The user successfully saved and tested their key after this fix.

Additional verification:

- 22 unit/integration tests across 3 files passed. Four new tests exercise the **actual installed Google SDK**, mocking only HTTP, including resumable-upload headers, both mode configurations, output parsing, quota errors, and cleanup. A new encrypted-store test preserves a long punctuation-containing credential.
- 10 desktop/mobile browser checks passed against the running app, including the long-key input regression and actual settings endpoint protections.
- A separate production validation copy built successfully without stopping the user's running app.
- Actual saved-key connection check: HTTP 200, `connected`, exact model `gemini-3.5-transcribe`.
- Actual Smart transcription: HTTP 200 using a short Windows-generated English WAV sample.
- Actual Verbatim transcription: HTTP 200 with the same sample after one failed attempt (HTTP 502). The failure's cause was not established; the manual retry succeeded. No automatic retry of billable inference was added.
- Both successful requests returned: `This is an audio text transcription test. The meeting begins at 10:00 in the morning.`

The real key was entered by the user in Settings; it was never read into this chat, printed, added to source, or included in test fixtures. New server diagnostics log only allowlisted error classifications, phase, and numeric status; never provider messages, response bodies, headers, filenames, or keys.
