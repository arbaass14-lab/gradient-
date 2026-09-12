import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp, errorHandler } from "../server/app.js";
import { readConfig } from "../server/config.js";
import { openDatabase, cleanExpired } from "../server/db.js";
import { createSession, hash, upsertGoogleUser } from "../server/security.js";
import { parseRange, htmlDocument } from "../server/content.js";

function fixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fieldnote-test-"));
  const config = {
    ...readConfig({}),
    dataDir,
    clientId: "unit-test-client",
    clientSecret: "unit-test-secret",
    ...options.config,
  };
  const db = openDatabase(dataDir);
  const app = createApp({ db, config, oauthClient: options.oauthClient });
  app.use(errorHandler);
  const users = {};
  for (const role of ["ADMIN", "VIEWER"]) {
    const id = randomUUID();
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(
      id,
      id,
      `${role.toLowerCase()}@example.com`,
      role,
      null,
      role,
      Date.now(),
    );
    const session = createSession(db, config, id);
    users[role] = { id, ...session, cookie: `portal_session=${session.raw}` };
  }
  t.after(() => {
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const as = (method, route, role = "ADMIN") =>
    request(app)
      [method](route)
      .set("Cookie", users[role].cookie)
      .set("Origin", config.origin)
      .set("X-CSRF-Token", users[role].csrf);
  const upload = async (
    buffer = Buffer.from("<h1>Team handbook</h1><p>Hello team.</p>"),
    filename = "guide.html",
    mime = "text/html",
  ) => {
    const result = await as("post", "/api/admin/content")
      .field("title", "Team handbook")
      .field("description", "Helpful reference")
      .field("category", "Onboarding")
      .field("tags", "team, guide")
      .attach("file", buffer, { filename, contentType: mime });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.item;
  };
  return { app, config, db, users, as, upload, dataDir };
}

test("anonymous clients cannot browse, stream or upload; private files and secrets are not static assets", async (t) => {
  const f = fixture(t);
  for (const url of [
    "/api/me",
    "/api/content",
    "/api/stream/guessed?ticket=abc",
  ])
    assert.equal((await request(f.app).get(url)).status, 401);
  assert.equal((await request(f.app).post("/api/admin/content")).status, 401);
  for (const url of [
    "/data/portal.sqlite",
    "/data/files/x",
    "/.env",
    "/server/app.js",
    "/uploads/file.mp4",
  ])
    assert.equal((await request(f.app).get(url)).status, 404);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, "tmp")), []);
});
test("viewer authorization blocks every admin method even with valid session and CSRF", async (t) => {
  const f = fixture(t);
  for (const [method, route] of [
    ["post", "/api/admin/content"],
    ["patch", "/api/admin/content/id"],
    ["delete", "/api/admin/content/id"],
  ])
    assert.equal((await f.as(method, route, "VIEWER")).status, 403);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, "tmp")), []);
});
test("mutations reject missing CSRF, incorrect tokens, and a foreign or absent Origin", async (t) => {
  const f = fixture(t);
  const base = () =>
    request(f.app).post("/api/logout").set("Cookie", f.users.ADMIN.cookie);
  assert.equal((await base().set("Origin", f.config.origin)).status, 403);
  assert.equal(
    (await base().set("X-CSRF-Token", f.users.ADMIN.csrf)).status,
    403,
  );
  assert.equal(
    (
      await base()
        .set("Origin", "https://evil.example")
        .set("X-CSRF-Token", f.users.ADMIN.csrf)
    ).status,
    403,
  );
  assert.equal(
    (await base().set("Origin", f.config.origin).set("X-CSRF-Token", "wrong"))
      .status,
    403,
  );
});
test("new verified accounts default to Viewer; seeded admins and manual role changes persist", (t) => {
  const f = fixture(t);
  const profile = {
    sub: "google-sub",
    email: "new@example.com",
    email_verified: true,
    name: "New member",
  };
  assert.equal(upsertGoogleUser(f.db, f.config, profile).role, "VIEWER");
  f.config.adminEmails = [profile.email];
  assert.equal(upsertGoogleUser(f.db, f.config, profile).role, "VIEWER");
  assert.equal(
    upsertGoogleUser(f.db, f.config, { ...profile, sub: "seeded-sub" }).role,
    "ADMIN",
  );
  assert.throws(() =>
    upsertGoogleUser(f.db, f.config, { ...profile, email_verified: false }),
  );
});
test("organization membership uses verified hd claim or explicit email when allowlists are configured", (t) => {
  const f = fixture(t, { config: { domains: ["example.com"] } });
  assert.throws(() =>
    upsertGoogleUser(f.db, f.config, {
      sub: "1",
      email: "somebody@example.com",
      email_verified: true,
    }),
  );
  assert.equal(
    upsertGoogleUser(f.db, f.config, {
      sub: "2",
      email: "somebody@example.com",
      email_verified: true,
      hd: "example.com",
    }).role,
    "VIEWER",
  );
  assert.throws(() =>
    readConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "http://example.com",
      ALLOWED_EMAILS: "a@example.com",
    }),
  );
  assert.doesNotThrow(() =>
    readConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "https://example.com",
      ALLOWED_EMAILS: "",
      ALLOWED_GOOGLE_DOMAINS: "",
    }),
  );
  assert.throws(() => readConfig({ DATA_DIR: "./dist/private" }));
});
test("empty allowlists allow any verified Google account, including production", () => {
  const config = readConfig({
    NODE_ENV: "production",
    APP_ORIGIN: "https://example.com",
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
  });
  assert.equal(config.production, true);
  assert.deepEqual(config.domains, []);
  assert.deepEqual(config.emails, []);
  assert.doesNotThrow(() =>
    upsertGoogleUser(
      openDatabase(fs.mkdtempSync(path.join(os.tmpdir(), "fieldnote-open-login-"))),
      config,
      {
        sub: "open-user",
        email: "person@gmail.com",
        email_verified: true,
        name: "Open User",
      },
    ),
  );
});
test("sessions expire and database role changes immediately revoke admin access", async (t) => {
  const f = fixture(t);
  f.db
    .prepare("UPDATE users SET role='VIEWER' WHERE id=?")
    .run(f.users.ADMIN.id);
  assert.equal((await f.as("patch", "/api/admin/content/id")).status, 403);
  f.db
    .prepare("UPDATE sessions SET expires_at=0 WHERE token_hash=?")
    .run(hash(f.users.VIEWER.raw));
  assert.equal((await f.as("get", "/api/content", "VIEWER")).status, 401);
  cleanExpired(f.db);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM sessions").get().n, 1);
});
test("HTML is sanitized, isolated, and served only with a grant tied to its originating session", async (t) => {
  const f = fixture(t);
  const item = await f.upload(
    Buffer.from(
      '<h1 onclick="alert(1)">Handbook</h1><script>alert(1)</script><iframe src="https://evil.example"></iframe><img src="https://evil.example/x"><a href="https://evil.example">link</a><form action="/api/logout"><button>go</button></form><style>body{background:url(https://evil.example)}</style>',
    ),
  );
  const listing = await f.as("get", "/api/content", "VIEWER");
  assert.equal(listing.status, 200);
  for (const key of ["storage_key", "mime", "created_by", "opens"])
    assert.equal(key in listing.body.items[0], false);
  const grant = (
    await f
      .as("post", `/api/content/${item.id}/access`, "VIEWER")
      .send({ recordOpen: true })
  ).body;
  assert.equal((await request(f.app).get(grant.url)).status, 401);
  assert.equal((await f.as("get", grant.url, "ADMIN")).status, 403);
  assert.equal(
    (await f.as("get", `/api/stream/${item.id}`, "VIEWER")).status,
    403,
  );
  const page = await f.as("get", grant.url, "VIEWER");
  assert.equal(page.status, 200);
  assert.match(page.headers["content-security-policy"], /sandbox/);
  assert.match(page.headers["cache-control"], /no-store/);
  assert.match(page.text, /<h1>Handbook<\/h1>/);
  assert.doesNotMatch(
    page.text,
    /<script|<iframe|onclick|evil\.example|<form|<a /i,
  );
  f.db.prepare("UPDATE grants SET expires_at=0").run();
  assert.equal((await f.as("get", grant.url, "VIEWER")).status, 403);
});
test("video supports valid full, partial, suffix, and HEAD requests and rejects invalid ranges", async (t) => {
  const f = fixture(t);
  const video = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypisom"),
    Buffer.alloc(100, 1),
  ]);
  const item = await f.upload(video, "clip.mp4", "video/mp4");
  const grant = (
    await f
      .as("post", `/api/content/${item.id}/access`, "VIEWER")
      .send({ recordOpen: true })
  ).body;
  const full = await f.as("get", grant.url, "VIEWER");
  assert.equal(full.status, 200);
  assert.equal(Number(full.headers["content-length"]), video.length);
  const partial = await f
    .as("get", grant.url, "VIEWER")
    .set("Range", "bytes=0-7");
  assert.equal(partial.status, 206);
  assert.equal(partial.headers["content-range"], `bytes 0-7/${video.length}`);
  assert.equal(Number(partial.headers["content-length"]), 8);
  const suffix = await f
    .as("get", grant.url, "VIEWER")
    .set("Range", "bytes=-10");
  assert.equal(suffix.status, 206);
  assert.equal(Number(suffix.headers["content-length"]), 10);
  assert.equal((await f.as("head", grant.url, "VIEWER")).status, 200);
  for (const range of [
    "bytes=999999-",
    "bytes=8-2",
    "bytes=0-1,3-4",
    "bytes=-0",
    "nonsense",
  ]) {
    const bad = await f.as("get", grant.url, "VIEWER").set("Range", range);
    assert.equal(bad.status, 416, range);
    assert.equal(bad.headers["content-range"], `bytes */${video.length}`);
  }
});
test("logout revokes both the session and its previously issued viewing grants", async (t) => {
  const f = fixture(t),
    item = await f.upload();
  const grant = (
    await f
      .as("post", `/api/content/${item.id}/access`, "VIEWER")
      .send({ recordOpen: true })
  ).body;
  const logout = await f.as("post", "/api/logout", "VIEWER");
  assert.equal(logout.status, 204);
  assert.match(logout.headers["set-cookie"][0], /HttpOnly/);
  assert.equal((await f.as("get", grant.url, "VIEWER")).status, 401);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM grants").get().n, 0);
});
test("uploads reject unsupported types, misleading signatures, empty and oversized HTML; temporary files are removed", async (t) => {
  const f = fixture(t);
  for (const [data, filename, mime] of [
    [Buffer.from("hello"), "bad.exe", "application/octet-stream"],
    [Buffer.from("not pdf"), "bad.pdf", "application/pdf"],
    [Buffer.from("not mp4"), "bad.mp4", "video/mp4"],
    [Buffer.from("<script>x</script>"), "bad.html", "text/html"],
    [Buffer.alloc(0), "empty.pdf", "application/pdf"],
    [
      Buffer.from("<p>" + "x".repeat(2 * 1024 * 1024) + "</p>"),
      "big.html",
      "text/html",
    ],
  ]) {
    const result = await f
      .as("post", "/api/admin/content")
      .field("title", "Test")
      .field("description", "")
      .field("category", "Test")
      .field("tags", "")
      .attach("file", data, { filename, contentType: mime });
    assert.equal(
      result.status,
      400,
      `${filename}: ${JSON.stringify(result.body)}`,
    );
  }
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, "tmp")), []);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, "files")), []);
});
test("metadata edits validate text and tags, retain storage and deny role injection", async (t) => {
  const f = fixture(t),
    item = await f.upload();
  const before = f.db
    .prepare("SELECT storage_key FROM content WHERE id=?")
    .get(item.id).storage_key;
  const patch = {
    title: "Updated guide",
    description: "A revised guide",
    category: "Reference",
    tags: "one, two",
    role: "ADMIN",
    storage_key: "../../.env",
  };
  const result = await f
    .as("patch", `/api/admin/content/${item.id}`)
    .send(patch);
  assert.equal(result.status, 200);
  assert.equal(result.body.item.title, "Updated guide");
  assert.equal(
    f.db.prepare("SELECT storage_key FROM content WHERE id=?").get(item.id)
      .storage_key,
    before,
  );
  assert.equal(
    (
      await f
        .as("patch", `/api/admin/content/${item.id}`)
        .send({ ...patch, title: "   " })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.as("patch", `/api/admin/content/${item.id}`).send({
        ...patch,
        tags: Array(9)
          .fill(0)
          .map((_, i) => i)
          .join(","),
      })
    ).status,
    400,
  );
});
test("deletion requires exact title confirmation and revokes access and stored bytes", async (t) => {
  const f = fixture(t),
    item = await f.upload();
  const grant = (
    await f
      .as("post", `/api/content/${item.id}/access`, "VIEWER")
      .send({ recordOpen: true })
  ).body;
  assert.equal(
    (
      await f
        .as("delete", `/api/admin/content/${item.id}`)
        .send({ confirmation: "wrong" })
    ).status,
    400,
  );
  assert.equal((await f.as("get", grant.url, "VIEWER")).status, 200);
  assert.equal(
    (
      await f
        .as("delete", `/api/admin/content/${item.id}`)
        .send({ confirmation: item.title })
    ).status,
    204,
  );
  assert.equal((await f.as("get", grant.url, "VIEWER")).status, 403);
  assert.equal(
    (await f.as("get", `/api/content/${item.id}`, "VIEWER")).status,
    404,
  );
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, "files")), []);
});
test("open counts increment only on an explicit opening, not video grant renewal", async (t) => {
  const f = fixture(t),
    item = await f.upload();
  await f
    .as("post", `/api/content/${item.id}/access`, "VIEWER")
    .send({ recordOpen: true });
  await f
    .as("post", `/api/content/${item.id}/access`, "VIEWER")
    .send({ recordOpen: false });
  assert.equal(
    (await f.as("get", `/api/content/${item.id}`)).body.item.opens,
    1,
  );
});
test("Google callback uses state, PKCE, nonce, verified identity, single-use flow and HttpOnly cookies", async (t) => {
  let generated,
    exchanged,
    nonceOverride,
    unverified = false;
  const oauthClient = {
    async generateCodeVerifierAsync() {
      return { codeVerifier: "test-verifier", codeChallenge: "test-challenge" };
    },
    generateAuthUrl(options) {
      generated = options;
      return (
        "https://accounts.google.com/o/oauth2/v2/auth?state=" + options.state
      );
    },
    async getToken(options) {
      exchanged = options;
      return { tokens: { id_token: "mock-id-token" } };
    },
    async verifyIdToken(options) {
      assert.equal(options.audience, "unit-test-client");
      return {
        getPayload: () => ({
          sub: "verified-sub",
          email: "verified@example.com",
          email_verified: !unverified,
          nonce: nonceOverride || generated.nonce,
          name: "Verified Member",
        }),
      };
    },
  };
  const f = fixture(t, { oauthClient });
  const begin = () => request(f.app).get("/auth/google");
  const first = await begin();
  const flowCookie = first.headers["set-cookie"][0].split(";")[0];
  assert.match(first.headers["set-cookie"][0], /HttpOnly/);
  assert.match(first.headers["set-cookie"][0], /SameSite=Lax/);
  assert.equal(generated.code_challenge, "test-challenge");
  assert.equal(generated.code_challenge_method, "S256");
  const callback = `/auth/google/callback?code=google-code&state=${generated.state}`;
  const success = await request(f.app).get(callback).set("Cookie", flowCookie);
  assert.equal(success.headers.location, "/");
  const sessionCookie = success.headers["set-cookie"].find((x) =>
    x.startsWith("portal_session="),
  );
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.deepEqual(exchanged, {
    code: "google-code",
    codeVerifier: "test-verifier",
  });
  assert.equal(
    (
      await request(f.app)
        .get("/api/me")
        .set("Cookie", sessionCookie.split(";")[0])
    ).body.user.role,
    "VIEWER",
  );
  assert.equal(
    (await request(f.app).get(callback).set("Cookie", flowCookie)).headers
      .location,
    "/?authError=expired",
  );
  const wrongState = await begin();
  assert.equal(
    (
      await request(f.app)
        .get("/auth/google/callback?code=c&state=wrong")
        .set("Cookie", wrongState.headers["set-cookie"][0].split(";")[0])
    ).headers.location,
    "/?authError=expired",
  );
  const wrongNonce = await begin();
  nonceOverride = "wrong";
  assert.equal(
    (
      await request(f.app)
        .get(`/auth/google/callback?code=c&state=${generated.state}`)
        .set("Cookie", wrongNonce.headers["set-cookie"][0].split(";")[0])
    ).headers.location,
    "/?authError=failed",
  );
  nonceOverride = null;
  unverified = true;
  const notVerified = await begin();
  assert.equal(
    (
      await request(f.app)
        .get(`/auth/google/callback?code=c&state=${generated.state}`)
        .set("Cookie", notVerified.headers["set-cookie"][0].split(";")[0])
    ).headers.location,
    "/?authError=failed",
  );
});
test("secure deployments use host-prefixed Secure HttpOnly cookies", async (t) => {
  const f = fixture(t, {
    config: { secure: true, origin: "https://portal.example.com" },
    oauthClient: {
      async generateCodeVerifierAsync() {
        return { codeVerifier: "v", codeChallenge: "c" };
      },
      generateAuthUrl() {
        return "https://accounts.google.com/";
      },
    },
  });
  const result = await request(f.app).get("/auth/google");
  const value = result.headers["set-cookie"][0];
  assert.match(value, /^__Host-portal_oauth=/);
  assert.match(value, /; Secure/);
  assert.match(value, /; HttpOnly/);
  assert.match(value, /; Path=\//);
  assert.doesNotMatch(value, /Domain=/);
});
test("range parser and sanitizer handle edge cases without enabling navigation or execution", () => {
  assert.deepEqual(parseRange("bytes=-999", 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=90-999", 100), { start: 90, end: 99 });
  assert.throws(() => parseRange("bytes=9007199254740993-", 100));
  const html = htmlDocument(
    '<meta http-equiv="refresh" content="0;url=https://evil.example"><svg onload="alert(1)"></svg><p style="background:url(https://evil.example)">safe</p>',
  );
  assert.doesNotMatch(html, /evil\.example|onload|<svg|http-equiv="refresh"/);
  assert.match(html, /<p>safe<\/p>/);
});
