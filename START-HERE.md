# Run your training portal

The app is named **Fieldnote**. It includes an Admin role and a Viewer role.
It uses a real SQLite database that is created automatically. **You do not need PostgreSQL, Prisma, a database URL, or a separate database installation.**

## 1. Install Node.js 24 LTS

Download the Node.js 24 LTS installer from [nodejs.org](https://nodejs.org/).
Close and reopen PowerShell or VS Code after installation.

```powershell
node --version
npm --version
```

Node should display `v24.x.x`.

## 2. Extract the ZIP and open the correct folder

Extract the entire ZIP first. Open the resulting `training-portal` folder in VS Code.
Open **Terminal → New Terminal**. You must be inside the folder containing `package.json`.

For example, if you extracted it to `D:\projects\training-portal`:

```powershell
cd "D:\projects\training-portal"
Get-ChildItem package.json
npm ci
Copy-Item .env.example .env
```

If PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm` in these commands. You do not need to change the system execution policy.
Only copy `.env.example` once; doing it again would overwrite your configured credentials.

## 3. Create your Google OAuth credentials

Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project.

1. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**, depending on the console layout).
2. Configure the app branding, audience, and your contact email.
3. For an ordinary Gmail account, choose an external audience. During testing, add every Google email you will use under **Test users**. Workspace-only internal apps require an eligible Google Workspace organization.
4. Create an OAuth client with application type **Web application**.
5. Add these exact local values:

| Google setting | Value |
| --- | --- |
| Authorized JavaScript origin | `http://localhost:3000` |
| Authorized redirect URI | `http://localhost:3000/auth/google/callback` |

This app uses a server-side OAuth redirect, so the JavaScript origin is not required by its flow, but this is the correct value if you set one. **The redirect URI is required and must match exactly.** It is not `/api/auth/callback/google`.

6. Copy the client ID and secret into `.env`:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
ADMIN_EMAILS=your-google-email@gmail.com
```

Keep `APP_ORIGIN=http://localhost:3000` and `PORT=3000`.
Use your own values. The ZIP cannot contain working credentials for your Google project.
Do not upload your `.env` file, send screenshots of secrets, or put credentials into frontend source.

For local testing, blank `ALLOWED_EMAILS` and `ALLOWED_GOOGLE_DOMAINS` allow any verified Google account that Google's app settings permit. To restrict access, set approved emails, for example:

```dotenv
ALLOWED_EMAILS=admin@gmail.com,viewer@gmail.com
```

For Google Workspace, you can instead use `ALLOWED_GOOGLE_DOMAINS=yourcompany.com`. Domain matching uses Google's verified Workspace domain claim. Admin addresses also need to pass this access list if configured.

## 4. Start the portal

```powershell
npm run build
npm start
```

Open **[http://localhost:3000](http://localhost:3000)** and choose **Continue with Google**.
Use `localhost` consistently. Do not switch to `127.0.0.1` while signing in.

For development with source changes, stop the server using **Ctrl+C**, then:

```powershell
npm run dev
```

Refresh the browser after frontend changes. Both modes use port 3000; do not run them together.

## 5. Get Admin access

Set `ADMIN_EMAILS` **before the account's first login** to seed that new account as Admin.
All other new users start as Viewer.

If you already signed in before setting the admin list, run this in a second terminal in the same project folder:

```powershell
npm run role -- your-google-email@gmail.com ADMIN
```

Refresh the page. You can now upload `samples/team-handbook.html`, a PDF, or an MP4.
Use a second Google account to test Viewer access, and add it to Google's test-user list if needed.

To demote an account:

```powershell
npm run role -- your-google-email@gmail.com VIEWER
```

## 6. Common problems

| Problem | Fix |
| --- | --- |
| `ENOENT ... package.json` | Run the commands in the extracted `training-portal` folder containing `package.json`, not its parent. |
| `No such built-in module: node:sqlite` | Install Node.js 24 LTS and reopen the terminal. |
| `redirect_uri_mismatch` | Set the exact redirect URI above for the same client ID used in `.env`. |
| `access_denied` or account not permitted | Add your Google account to the app's test users; check audience settings and this app's allow-lists. |
| Google account selection succeeds, but login fails | Check both OAuth credentials belong to the same web client, verify the secret, account allow-list and redirect URI, restart the app, and start a fresh sign-in from `localhost:3000`. |
| You remain a Viewer | Run the manual role command after your first login, then refresh. |
| Port 3000 is in use | Stop the other local server with Ctrl+C. If you change ports, update `PORT`, `APP_ORIGIN`, and both Google URLs together. |
| SQLite warning | Some Node.js 24 releases label `node:sqlite` experimental. The module is included; it does not need a separate installation. |
| PDF won't render | The PDF may be damaged, password-protected, or unsupported. Try a normal, unencrypted PDF and re-open it. |
| MP4 won't play | MP4 is a container. Prefer H.264 video with AAC audio for broad browser support. |
| HTML looks different | Uploads are deliberately sanitized and use the portal's reading style. Scripts, forms, remote assets, embedded frames, links, and uploaded CSS are removed. |

Your database and uploads are stored in `data/`. Stopping and restarting the app preserves them. Keep this folder private and back it up. Read `README.md` before deploying to a server.
