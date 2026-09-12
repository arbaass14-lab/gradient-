# Verification record

Package prepared on 12 September 2026.

## Completed

- Node.js 24.19.0 runtime.
- Dependencies installed successfully and a `package-lock.json` generated.
- `npm test`: **16 tests passed, 0 failed**.
- `npm run build`: **passed**. Vite produces the React app, PDF.js module/worker, and local PDF font/CMap assets.
- PDF.js parsed and rendered both pages of a generated two-page PDF to a Node canvas, including text extraction and loading-task cleanup. This checks the renderer dependency, not the browser interface.
- `npm audit --omit=dev --json`: **0 reported runtime vulnerabilities** at the time of packaging. This is a point-in-time dependency advisory check, not a proof that the application has no vulnerabilities.
- Real Express route tests use isolated SQLite databases and actual upload/protected-stream requests. The external Google exchange is mocked inside tests; no test login route is shipped.

The security tests cover unauthenticated reads; private path probing; Viewer POST/PATCH/DELETE denial; missing/invalid CSRF and foreign Origin; default Viewer and seeded Admin; Workspace domain/email access rules; session expiration; immediate server-side role changes; sanitized HTML and sandbox headers; content grants bound to a session; expiration; MP4 byte ranges/HEAD; logout revocation; invalid/oversized uploads and cleanup; metadata validation; confirmed deletion; basic open counts; OAuth state/PKCE/nonce/verified email handling; and Secure host-prefixed cookie attributes.

## Not verified in this environment

- **Interactive browser execution, visual layout, accessibility behavior, PDF canvas rendering in an actual browser, and actual video playback:** a usable browser capability was not available. Browser installation could not complete in this environment. Responsive styles and these UI paths are implemented, but no successful browser run is claimed.
- **Real Google OAuth consent with your credentials:** your Google client ID/secret, test users and organization configuration are required.
- **Production deployment, DNS, HTTPS and reverse-proxy behavior:** configuration examples are provided, but no external deployment was performed.
- Windows execution was documented but not run on a Windows machine. The app itself uses cross-platform Node APIs and has no native database compilation requirement.

## Manual acceptance checklist

1. Follow `START-HERE.md`, register the exact local callback and add two test Google accounts. Put the intended administrator in `ADMIN_EMAILS` before first login.
2. Sign in as Admin. Upload an MP4 using H.264/AAC, a normal unencrypted PDF, and `samples/team-handbook.html` with title/description/category/tags. Check progress, success messages, list/grid views, search, filters and sorting.
3. Open all three content types. Test MP4 playback and seeking, PDF previous/next and zoom, and the HTML reading layout. Leave a video open for more than five minutes and verify grant renewal preserves playback position.
4. Resize the browser to a narrow mobile width; check navigation, upload/edit/delete dialogs, the viewers, scrolling, labels and keyboard focus. Verify the PDF has no built-in download/print toolbar.
5. Edit metadata, then open Delete. Verify the delete button is disabled until the exact title is typed. Cancel once, then confirm another deletion.
6. Sign in with the second account in a separate browser profile. It should default to Viewer and have no upload, edit or delete controls. Requests to `/api/admin/content` must return 403 even if issued manually.
7. Copy a protected stream URL from the Admin session to an incognito browser or another signed-in session. It must fail. After a grant expires, its originating session must also be rejected if it reuses that URL. Reopen the content to get new access.
8. Sign out, then retry the old session's API/stream request. Access must fail. Make a server-side role change and verify the next admin API request reflects it.
9. Try `.exe` uploads, renamed non-PDF files, empty files and files exceeding each documented limit. Verify errors are clear. Upload HTML containing scripts, remote assets, links and forms, and confirm these are removed/disabled.
10. Review the README's protection table. An authorized browser can still recover received bytes; do not present toolbar hiding or canvas rendering as DRM.

Only mark the outstanding steps as passed after you have run them in your environment.
