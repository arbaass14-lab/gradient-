import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, "portal.sqlite");
  const db = new DatabaseSync(file);
  fs.chmodSync(file, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL, name TEXT NOT NULL, domain TEXT,
      role TEXT NOT NULL DEFAULT 'VIEWER' CHECK(role IN ('VIEWER','ADMIN')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_flows (
      token_hash TEXT PRIMARY KEY, state TEXT NOT NULL, nonce TEXT NOT NULL,
      verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, tags TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('video','pdf','html')),
      storage_key TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      opens INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS grants (
      token_hash TEXT PRIMARY KEY,
      session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
      content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS grants_expiry ON grants(expires_at);
    CREATE INDEX IF NOT EXISTS oauth_expiry ON oauth_flows(expires_at);
  `);
  return db;
}
export function cleanExpired(db) {
  const now = Date.now();
  for (const table of ["grants", "sessions", "oauth_flows"])
    db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now);
}
