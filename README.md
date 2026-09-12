# Fieldnote — Private training portal

A responsive React and Express application for sharing MP4 videos, PDF documents, and HTML reference pages inside one organization. Authentication uses Google's server-side OAuth/OpenID Connect flow. Users and metadata live in SQLite; files are stored outside public assets.

**Start with [START-HERE.md](START-HERE.md)** for exact Windows commands and Google OAuth configuration.

## Features

- Google-only login; no passwords, fake login routes, or browser-stored OAuth tokens.
- Viewer is the default new-user role. Admins can be seeded by email at first login or set with a local operator command.
- Admin-only upload, edit metadata, and delete. Deletion requires typing the exact title in a confirmation dialog and is checked by the API.
- Search titles, descriptions, categories and tags; filter by content type or category; sort by title/date; grid/list layouts.
- Inline video with range requests and automatically refreshed viewing grants.
- PDFs rendered with PDF.js into a canvas, with page navigation and zoom. No built-in PDF download/print toolbar.
- Sanitized HTML in an iframe with an empty sandbox permission list.
- Admin-only basic open counts. These count explicit opening requests, not unique people, completed views, or grant renewals. They are approximate and can be inflated by a legitimate account.
- Upload progress, clear errors, loading states, empty states, keyboard focus, dialog focus containment, and responsive layouts.
- Server-side role checks, CSRF protection, organization access lists, rate limits, secure cookie settings, private storage, and session-bound expiring content grants.

## Stack and prerequisites

| Component | Choice |
| --- | --- |
| Runtime | Node.js 24 LTS, npm |
| Frontend | React 19, Vite |
| Backend | Express 5 |
| Authentication | Google Auth Library, authorization-code flow, PKCE, state, nonce |
| Database | SQLite through Node's built-in `node:sqlite` |
| Storage | Local private disk, randomized filenames, persistent `DATA_DIR` |
| PDF renderer | PDF.js, bundled worker, local CMaps and standard fonts |
| HTML sanitization | `sanitize-html` plus browser iframe sandbox and CSP |
| Tests | Node test runner and Supertest |

The lockfile records exact tested dependency versions. Install with `npm ci`.
No PostgreSQL installation, Prisma commands, Docker, or database connection URL is required.
SQLite/private disk was selected to make this ZIP straightforward to run on a laptop or one persistent server. It is not suitable for an ephemeral serverless filesystem or multiple independently scaled application instances.

## Commands

```bash
npm ci
# Copy .env.example to .env and configure it first.
npm run build
npm start

# Development, on the same port and origin:
npm run dev

# Operator commands after the user has signed in once:
npm run role -- person@example.com ADMIN
npm run role -- person@example.com VIEWER

# Validation:
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Only run one app process per configured port. The database schema initializes automatically.
The development server deliberately disables hot module reload; refresh for frontend changes. Node restarts after backend changes.

## Authentication and role behavior

1. `/auth/google` creates a random state, nonce, PKCE verifier, and ten-minute one-use OAuth flow record. A random HttpOnly cookie binds the flow to the initiating browser.
2. Google returns to `/auth/google/callback`. The server validates the browser flow and state, consumes the flow, exchanges the code with PKCE, and verifies the ID token with Google's library (signature, issuer, audience and expiry). It independently checks nonce, verified email, and organization membership.
3. Users are keyed by stable Google `sub`, not a client-provided email. New accounts get Viewer, except explicitly seeded `ADMIN_EMAILS` matches. Existing roles are preserved. Changing `ADMIN_EMAILS` does not repeatedly promote existing users and does not demote anyone; use the role command.
4. The server creates a fresh opaque 256-bit session token and stores only its SHA-256 hash in SQLite. The cookie is HttpOnly, SameSite=Lax, Path=/, and Secure for HTTPS. HTTPS deployments use `__Host-` cookie names. No Google access, ID, or refresh token is sent to client code or stored in localStorage/sessionStorage.
5. Sessions have an absolute lifetime (`SESSION_HOURS`, default 8). Each protected request checks the session, current database role, and current organization access rules. Sign-out deletes the session and cascades its viewing grants. The frontend also clears loaded content when its session expires or a request returns 401, and polls session state every minute.

`ALLOWED_EMAILS` and `ALLOWED_GOOGLE_DOMAINS` are OR conditions. Domain membership requires the verified Google Workspace `hd` claim; a matching email suffix alone is insufficient. Empty lists allow any verified Google account to sign in, including production when the app is served over HTTPS. Google consent/test-user restrictions also apply independently.

Roles can change in the database while a session exists. Enforcement changes on the next API request. The frontend reflects a role change after refresh or its next session poll. There is no role-management HTTP API or self-promotion path. The local `npm run role` command requires trusted access to the app's server/database.

## Content protection: real boundaries and their limits

**No ordinary browser application can guarantee that an authorized person cannot save, reconstruct, photograph, or screen-record content it displays.** This implementation meets the assignment's minimum access-protection approach; it does not claim an unbreakable download block or DRM.

| Mechanism | What it actually protects | What it does not guarantee |
| --- | --- | --- |
| Private disk outside `dist` | No public `/uploads` paths or raw storage URL. API responses never disclose storage keys. | Server operators and anyone with host filesystem access can read files. |
| Server-side session + role checks | Anonymous users cannot read content; Viewers cannot mutate it by guessing API routes. Roles are read from the database. | An approved Viewer is intentionally authorized to consume all organization content. |
| Short-lived session-bound grants | `/api/content/:id/access` requires authentication and CSRF, and issues a random token valid for 5 minutes by default. Stream requests must present that token and the exact originating session cookie. Copying the URL to incognito or another session fails, even if the other session belongs to the same user. | The originating user can replay a grant with their session cookie during its lifetime, including saving bytes with dev tools or an authenticated HTTP client. |
| Private, no-store responses | Reduces accidental browser/proxy caching. No permanent publicly usable media links are issued. | Cannot remove already received data or prevent a deliberate client from storing it. |
| Range-aware video endpoint | Supports seeking with 206/416 and bounds validation; authorizes every new request. No storage redirect. | An authorized client can collect ranges or request the whole file. A response already started may finish after a token/session expires or is revoked. |
| PDF.js canvas | Users read rendered pages without a native PDF download/print toolbar. PDF scripting/eval is disabled. | The original PDF bytes still reach the authorized browser via a protected request and can be recovered from memory/network tools. Canvas rendering is a deterrent, not file confidentiality from the reader. |
| Sanitized sandboxed HTML | Stored content loses scripts, frames, links, forms, remote assets and uploaded CSS. The iframe has no allow-scripts, allow-same-origin, allow-popups, allow-downloads, form or top-navigation permissions. CSP also restricts direct HTML responses. | Readers can inspect or copy the sanitized HTML. It is not meant to preserve arbitrary interactive uploaded web applications. |
| Hidden video download controls, suppressed context menu and print CSS | Discourages casual UI actions. | These are only deterrents; browser support varies, and a user can alter the DOM/CSS or browser settings. |

Video grants refresh 15 seconds before expiry. Refreshing reloads the source while preserving playback position and play/pause state; a brief interruption can occur. PDF and HTML bytes are loaded once into memory while the grant is valid. The application does not embed provider-signed raw object URLs, service-worker caches, or download links.

The iframe's reading style is intentionally restrictive. Inline images, uploaded CSS, scripts, forms, external links, and embeds are removed. This prevents data exfiltration and active-content attacks, but sacrifices document fidelity. PDFs containing forms, annotations, accessibility text layers, password protection, or unusual fonts are not fully supported by this minimal canvas viewer. The surrounding application is keyboard accessible; PDF text is rendered visually rather than exposed as a selectable accessible text layer.

### What I would add with more time

- Server-side PDF rasterization in a sandboxed worker, sending only page images to the browser to avoid delivering the original PDF binary. This still permits image capture.
- Per-user visible/invisible watermarks; proper audit logs and view events with deduplication.
- Encrypted HLS/DASH plus an EME/CDM DRM provider for stronger video controls. Screen capture remains an inherent limitation.
- Private S3-compatible storage, centralized session/grant storage, and PostgreSQL for multi-instance hosting.
- Antivirus scanning, deeper parser validation, quota enforcement, asynchronous processing, and upload quarantine before publication.
- Better accessibility text layers, resumable uploads, pagination, MFA/organization identity controls, and administrative session revocation.

## Upload validation and storage

| Type | Allowed extensions | Maximum size | Checks |
| --- | --- | --- | --- |
| Video | `.mp4` | 250 MiB | Extension, allowed MIME, nonempty, MP4 `ftyp` header |
| PDF | `.pdf` | 25 MiB | Extension, allowed MIME, nonempty, `%PDF-` header |
| HTML | `.html`, `.htm` | 2 MiB | Extension, allowed MIME, UTF-8, no NUL bytes, basic HTML structure, sanitization |

These are basic allow-list/signature checks, not complete file parsing or malware scanning. Browser-compatible H.264/AAC MP4 encoding is recommended. Uploads stream to temporary disk with an absolute 250 MiB request file limit; the smaller PDF/HTML limits are verified afterward. A deliberately oversized PDF may consume up to the global limit before rejection. Temporary files are removed on ordinary validation/multipart errors. A crashed process can leave private temporary/orphan files; remove these during controlled maintenance when no uploads are active.

Titles are 1–160 characters, descriptions up to 3,000, categories 1–60, and tags up to 8 entries of 30 characters. Metadata is validated server-side. SQL uses parameter binding. Filenames are randomized; uploaded names never become disk paths. The authenticated user's ID and role are read server-side, not accepted from the request.

Mutations enforce both a matching Origin and a session CSRF token. The token is exposed only to same-origin authenticated JavaScript; it is not an authentication bearer token. No CORS allowance is enabled. Request throttling limits OAuth attempts and API requests; the in-memory rate limiter is intended for one instance. There is no per-account storage quota yet.

Deletion invalidates the database record and grants before attempting unlink. An unlink failure leaves an inaccessible orphan and a server maintenance message. Already-open stream responses may continue until completion.

## Data and file layout

```text
training-portal/
  src/                  React application, styles and inline viewers
  server/               Express routes, auth, SQLite schema, validation
  scripts/role.js        Trusted operator role command
  tests/                API/security integration tests
  samples/              A ready-to-upload HTML guide
  docs/                 Deployment and verification information
  .github/workflows/    GitHub Actions test/build workflow
  .env.example          Configuration placeholders, no credentials
  START-HERE.md         Beginner-friendly local setup
  package.json          Run npm commands in this folder
  package-lock.json     Exact dependency resolution
  data/                 Created on first start; never public or committed
    portal.sqlite       Users, roles, metadata, sessions, grants and flows
    files/              Private uploaded bytes; sanitized HTML
    tmp/                Temporary in-progress uploads
  dist/                 Generated frontend build; only this is public
```

Expired sessions, grants and OAuth flows are pruned at startup and once per minute. SQLite WAL mode supports normal single-server concurrency; synchronous database access is suitable for a modest internal portal, not large-scale workloads. Back up the entire `DATA_DIR` with the server stopped (or use a consistent SQLite-aware backup). Include the files as well as the database. On Linux, files/directories receive restrictive permissions; use suitable Windows ACLs when hosting on Windows.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Use a persistent VM or container with a persistent data volume, HTTPS, a process supervisor, and an organization allow-list. Never expose the `data` directory through a web server or mount it inside `dist`.

Do not deploy this disk-backed application as-is to ephemeral/serverless hosting. Do not use a public EC2 IP over plain HTTP for production Google OAuth. Register an HTTPS hostname and its exact `/auth/google/callback` URI.

## Validation

`npm test` runs security/API tests against isolated temporary databases with a mocked external Google token exchange. Tests include role enforcement, CSRF/origin, upload validation, sanitation, session/grant expiration, cross-session token rejection, byte ranges, role changes, logout revocation, deletion confirmation, default roles, organization membership, OAuth state/nonce/PKCE behavior and cookie attributes.

The production frontend is built with `npm run build`. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for the checks completed for this package and the manual real-Google acceptance steps. **Real Google account consent requires your credentials and has not been tested with your Google project.** The test-only OAuth mock is dependency injection in the test process; the deployed server exposes no test authentication route.

## Primary implementation references

- [Google OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google Auth Library documentation](https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest)
- [Node.js SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [Mozilla PDF.js canvas rendering examples](https://mozilla.github.io/pdf.js/examples/)
- [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)
- [MDN HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests)

The source is included for your assignment and customization. Third-party packages retain their own licenses, available through their installed package directories.
