import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.js";
import {
  security,
  token,
  hash,
  equal,
  cookie,
  cookieOptions,
  sessionName,
  flowName,
  createSession,
  upsertGoogleUser,
} from "./security.js";
import {
  TYPES,
  LIMITS,
  metadata,
  validateFile,
  parseRange,
  publicItem,
  problem,
} from "./content.js";

export function createApp({ db, config, oauthClient, dev = false }) {
  const app = express();
  const privateDir = path.join(config.dataDir, "files");
  const tmpDir = path.join(config.dataDir, "tmp");
  for (const dir of [privateDir, tmpDir])
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const client =
    oauthClient ||
    new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.origin + "/auth/google/callback",
    });
  const { auth, admin, csrf } = security(db, config);
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", ...(dev ? ["'unsafe-inline'"] : [])],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: [
            "'self'",
            ...(dev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
          ],
          workerSrc: ["'self'", "blob:"],
          mediaSrc: ["'self'"],
          frameSrc: ["'self'", "about:"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.secure ? [] : null,
        },
      },
      strictTransportSecurity: config.secure ? undefined : false,
      referrerPolicy: { policy: "no-referrer" },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(["/api", "/auth"], (req, res, next) => {
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("Pragma", "no-cache");
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 40,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 2000,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a few minutes." },
    }),
  );
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.get("/api/config", (req, res) =>
    res.json({
      googleConfigured: Boolean(config.clientId && config.clientSecret),
      limits: LIMITS,
    }),
  );

  app.get("/auth/google", async (req, res) => {
    if (!config.clientId || !config.clientSecret)
      return res.redirect("/?authError=configuration");
    const raw = token(),
      state = token(),
      nonce = token();
    const { codeVerifier, codeChallenge } =
      await client.generateCodeVerifierAsync();
    const prior = cookie(req, flowName(config));
    if (prior)
      db.prepare("DELETE FROM oauth_flows WHERE token_hash = ?").run(
        hash(prior),
      );
    db.prepare("INSERT INTO oauth_flows VALUES (?, ?, ?, ?, ?)").run(
      hash(raw),
      state,
      nonce,
      codeVerifier,
      Date.now() + 600000,
    );
    res.cookie(flowName(config), raw, {
      ...cookieOptions(config),
      maxAge: 600000,
    });
    res.redirect(
      client.generateAuthUrl({
        scope: ["openid", "email", "profile"],
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        prompt: "select_account",
        access_type: "online",
      }),
    );
  });
  app.get("/auth/google/callback", async (req, res) => {
    const raw = cookie(req, flowName(config));
    const flow = db
      .prepare("SELECT * FROM oauth_flows WHERE token_hash = ?")
      .get(hash(raw));
    db.prepare("DELETE FROM oauth_flows WHERE token_hash = ?").run(hash(raw));
    res.clearCookie(flowName(config), cookieOptions(config));
    if (
      !flow ||
      flow.expires_at <= Date.now() ||
      !equal(flow.state, req.query.state)
    )
      return res.redirect("/?authError=expired");
    if (req.query.error) return res.redirect("/?authError=cancelled");
    if (typeof req.query.code !== "string")
      return res.redirect("/?authError=failed");
    try {
      const { tokens } = await client.getToken({
        code: req.query.code,
        codeVerifier: flow.verifier,
      });
      if (!tokens.id_token) throw new Error("Missing ID token.");
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !equal(payload.nonce, flow.nonce))
        throw new Error("Nonce did not match.");
      const user = upsertGoogleUser(db, config, payload);
      // Rotate the browser session after authentication. Never send Google tokens to the browser.
      const prior = cookie(req, sessionName(config));
      if (prior)
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
          hash(prior),
        );
      const session = createSession(db, config, user.id);
      res.cookie(sessionName(config), session.raw, {
        ...cookieOptions(config),
        maxAge: config.sessionHours * 3600000,
      });
      res.redirect("/");
    } catch (error) {
      // Do not log OAuth codes, credentials, ID tokens, or upstream error objects.
      console.error(
        "Google sign-in could not be completed. Check OAuth configuration and the account allow-list.",
      );
      res.redirect("/?authError=failed");
    }
  });
  app.get("/api/me", auth, (req, res) =>
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
      },
      csrf: req.user.csrf,
      expiresAt: req.user.expires_at,
    }),
  );
  app.post("/api/logout", auth, csrf, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
      req.user.token_hash,
    );
    res.clearCookie(sessionName(config), cookieOptions(config));
    res.status(204).end();
  });
  app.get("/api/content", auth, (req, res) => {
    const items = db
      .prepare("SELECT * FROM content ORDER BY created_at DESC")
      .all();
    res.json({
      items: items.map((row) => publicItem(row, req.user.role === "ADMIN")),
    });
  });
  app.get("/api/content/:id", auth, (req, res) => {
    const row = db
      .prepare("SELECT * FROM content WHERE id = ?")
      .get(req.params.id);
    if (!row) throw problem("This content is no longer available.", 404);
    res.json({ item: publicItem(row, req.user.role === "ADMIN") });
  });
  app.post("/api/content/:id/access", auth, csrf, (req, res) => {
    const row = db
      .prepare("SELECT id FROM content WHERE id = ?")
      .get(req.params.id);
    if (!row) throw problem("This content is no longer available.", 404);
    const raw = token(),
      expiresAt = Math.min(
        Date.now() + config.streamTTL * 1000,
        req.user.expires_at,
      );
    db.prepare("INSERT INTO grants VALUES (?, ?, ?, ?)").run(
      hash(raw),
      req.user.token_hash,
      row.id,
      expiresAt,
    );
    if (req.body?.recordOpen === true)
      db.prepare("UPDATE content SET opens = opens + 1 WHERE id = ?").run(
        row.id,
      );
    res.json({ url: `/api/stream/${row.id}?ticket=${raw}`, expiresAt });
  });
  app.get("/api/stream/:id", auth, async (req, res, next) => {
    const raw = req.query.ticket;
    if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw problem("This viewing link is invalid. Reopen the item.", 403);
    const grant = db
      .prepare(
        "SELECT * FROM grants WHERE token_hash = ? AND session_hash = ? AND content_id = ? AND expires_at > ?",
      )
      .get(hash(raw), req.user.token_hash, req.params.id, Date.now());
    if (!grant)
      throw problem("This viewing link expired. Reopen the item.", 403);
    const row = db
      .prepare("SELECT * FROM content WHERE id = ?")
      .get(req.params.id);
    if (!row) throw problem("This content is no longer available.", 404);
    const file = path.join(privateDir, row.storage_key);
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      throw problem(
        "The stored file is unavailable. Contact your administrator.",
        404,
      );
    }
    let range;
    try {
      range = parseRange(req.headers.range, stat.size);
    } catch (error) {
      res.set("Content-Range", `bytes */${stat.size}`);
      throw error;
    }
    res.set({
      "Content-Type": row.mime,
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    if (row.kind === "html")
      res.set(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      );
    const start = range?.start ?? 0,
      end = range?.end ?? stat.size - 1;
    res
      .status(range ? 206 : 200)
      .set("Content-Length", String(end - start + 1));
    if (range) res.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on("error", (error) =>
      res.headersSent ? res.destroy() : next(error),
    );
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: tmpDir,
      filename: (req, file, cb) => cb(null, randomUUID()),
    }),
    limits: {
      fileSize: LIMITS.video,
      files: 1,
      fields: 4,
      parts: 6,
      fieldSize: 12000,
    },
    fileFilter(req, file, cb) {
      const type = TYPES[path.extname(file.originalname).toLowerCase()];
      if (
        !type ||
        ![
          type.mime,
          "application/octet-stream",
          ...(type.kind === "html" ? ["text/plain"] : []),
        ].includes(file.mimetype)
      )
        return cb(
          problem("Unsupported file type. Upload an MP4, PDF, or HTML file."),
        );
      cb(null, true);
    },
  });
  // Authorization and CSRF checks run BEFORE multipart parsing or writing bytes.
  app.post(
    "/api/admin/content",
    auth,
    admin,
    csrf,
    upload.single("file"),
    async (req, res) => {
      let stored;
      try {
        const meta = metadata(req.body),
          type = await validateFile(req.file);
        const id = randomUUID(),
          storageKey = randomUUID();
        stored = path.join(privateDir, storageKey);
        await fsp.rename(req.file.path, stored);
        await fsp.chmod(stored, 0o600);
        const { size } = await fsp.stat(stored),
          now = Date.now();
        db.prepare(
          `INSERT INTO content (id,title,description,category,tags,kind,storage_key,mime,size,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          id,
          meta.title,
          meta.description,
          meta.category,
          JSON.stringify(meta.tags),
          type.kind,
          storageKey,
          type.mime,
          size,
          req.user.id,
          now,
          now,
        );
        res
          .status(201)
          .json({
            item: publicItem(
              db.prepare("SELECT * FROM content WHERE id = ?").get(id),
              true,
            ),
          });
      } catch (error) {
        if (req.file?.path)
          await fsp.rm(req.file.path, { force: true }).catch(() => {});
        if (stored) await fsp.rm(stored, { force: true }).catch(() => {});
        throw error;
      }
    },
  );
  app.patch("/api/admin/content/:id", auth, admin, csrf, (req, res) => {
    const meta = metadata(req.body);
    const result = db
      .prepare(
        "UPDATE content SET title=?, description=?, category=?, tags=?, updated_at=? WHERE id=?",
      )
      .run(
        meta.title,
        meta.description,
        meta.category,
        JSON.stringify(meta.tags),
        Date.now(),
        req.params.id,
      );
    if (!result.changes)
      throw problem("This content is no longer available.", 404);
    res.json({
      item: publicItem(
        db.prepare("SELECT * FROM content WHERE id = ?").get(req.params.id),
        true,
      ),
    });
  });
  app.delete("/api/admin/content/:id", auth, admin, csrf, async (req, res) => {
    const item = db
      .prepare("SELECT * FROM content WHERE id = ?")
      .get(req.params.id);
    if (!item) throw problem("This content is no longer available.", 404);
    if (req.body?.confirmation !== item.title)
      throw problem("Type the exact content title to confirm deletion.");
    // Invalidate access first. An unlink failure leaves an inaccessible orphan, never a live file URL.
    db.prepare("DELETE FROM content WHERE id = ?").run(item.id);
    try {
      await fsp.rm(path.join(privateDir, item.storage_key), { force: true });
    } catch {
      console.error(
        "Deleted content has an orphaned private file; storage maintenance is needed.",
      );
    }
    res.status(204).end();
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use("/auth", (req, res) =>
    res.status(404).json({ error: "Authentication route not found." }),
  );
  if (!dev) {
    app.use(
      express.static(path.join(ROOT, "dist"), {
        index: false,
        dotfiles: "deny",
        etag: true,
        maxAge: "1h",
      }),
    );
    app.get("/", (req, res) =>
      res
        .set("Cache-Control", "no-store")
        .sendFile(path.join(ROOT, "dist/index.html")),
    );
    app.use((req, res) => res.status(404).send("Page not found."));
  }
  return app;
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    return res
      .status(400)
      .json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "File exceeds the 250 MB upload limit. PDFs are limited to 25 MB and HTML to 2 MB."
            : "Invalid upload. Choose one file and complete the four metadata fields.",
      });
  }
  const status = error.status || 500;
  if (status >= 500)
    console.error(
      "Request failed:",
      error.code || error.name || "InternalError",
    );
  res
    .status(status)
    .json({
      error:
        status >= 500
          ? "Something went wrong. Please retry or contact your administrator."
          : error.message,
    });
}
