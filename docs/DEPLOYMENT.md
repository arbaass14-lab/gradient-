# Deploy on one persistent server

This project is designed for a persistent Node.js server. The local SQLite database and uploaded files must survive application restarts and releases.

## Production configuration

Use Node.js 24 LTS and a domain with HTTPS. In `.env`, set:

```dotenv
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://training.your-company.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
ALLOWED_GOOGLE_DOMAINS=your-company.com
ALLOWED_EMAILS=
ADMIN_EMAILS=admin@your-company.com
DATA_DIR=/var/lib/fieldnote
SESSION_HOURS=8
STREAM_TTL_SECONDS=300
TRUST_PROXY_HOPS=1
```

Replace the placeholders with your actual values. For approved individual Google accounts rather than Workspace, fill `ALLOWED_EMAILS` and leave the domain list blank. For open access, leave both allowlists blank and keep an HTTPS origin plus both OAuth credentials. The app will accept any verified Google account that Google allows into the OAuth client.

Register these values in the same Google OAuth web client:

| Setting | Example |
| --- | --- |
| JavaScript origin | `https://training.your-company.com` |
| Redirect URI | `https://training.your-company.com/auth/google/callback` |

The JavaScript origin is optional for this server-side flow. The redirect URI must exactly match. Configure Google's audience/test users/publishing status for the organization that will use the app.

Install and build in the release folder:

```bash
npm ci
npm run build
npm test
```

Run the application as a dedicated unprivileged operating-system user with read/write access to `DATA_DIR` and read access to the app and `.env`. Keep `.env` readable only by that user and trusted operators. Do not run the app as root.

## Reverse proxy example

Terminate HTTPS using your existing TLS reverse proxy. Example Nginx application location inside your already configured HTTPS server block:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    client_max_body_size 251m;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    # Excludes token-bearing request query strings from access logs.
    access_log off;
}
```

This is an application location, not a complete certificate or Nginx installation guide. Use your real DNS/TLS configuration, redirect HTTP to HTTPS, and expose only the proxy's ports externally. The app binds port 3000 on all interfaces; firewall it so only the trusted proxy can reach it. `TRUST_PROXY_HOPS=1` is appropriate only with exactly one trusted proxy and direct access blocked. Do not copy a proxy trust setting that does not match your topology.

Do not configure any `alias`, static location, public bucket or CDN exposing `DATA_DIR`. Do not cache `/api` or `/auth`. Avoid logging query strings for `/api/stream` and `/auth/google/callback`; they contain short-lived viewing grants or OAuth codes. Do not log cookie headers.

## Process supervisor example

For a Linux host with a dedicated `fieldnote` user, persistent data folder, and the release in `/opt/fieldnote`, a systemd service may look like:

```ini
[Unit]
Description=Fieldnote training portal
After=network.target

[Service]
Type=simple
User=fieldnote
Group=fieldnote
WorkingDirectory=/opt/fieldnote
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/fieldnote/server/index.js
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/fieldnote

[Install]
WantedBy=multi-user.target
```

Set `ExecStart` to the actual Node.js 24 executable path and set `DATA_DIR` to `/var/lib/fieldnote`. Create the data directory and give the service user ownership before starting. The process reads `/opt/fieldnote/.env` automatically. Existing environment variables take precedence; keep them consistent. This service does not need a shell or global npm process manager.

## Operational limits and maintenance

- Back up the database and private files together. For a simple consistent backup, stop the service, copy the entire data directory, then restart it. Protect backups as carefully as live content.
- Persist the data directory outside release folders. Replacing source/build files must not delete data.
- Run one app instance for this deployment model. Add shared database, object storage, centralized rate/session controls and distributed coordination before scaling out.
- Watch available disk space. There is no organization quota or antivirus quarantine in this assignment implementation.
- On a process crash, abandoned temporary uploads or orphaned files may remain private on disk. Clean these only during maintenance when uploads are stopped and after checking database references.
- Sessions and grants live in SQLite and survive normal restarts until their configured expiry. A database restore can restore still-unexpired sessions; invalidate session rows if this is undesirable after recovery.
- TLS, DNS, cloud-instance access, real OAuth consent, production infrastructure and backups must be configured in your environment. They are not provisioned by the ZIP.

An EC2 instance can host the app this way with a persistent volume and HTTPS domain. An ordinary public `http://<EC2-IP>:3000` URL is not the production OAuth configuration.
