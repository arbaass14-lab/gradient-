import {
  randomBytes,
  createHash,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";

export const token = () => randomBytes(32).toString("base64url");
export const hash = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
export const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export function cookie(req, name) {
  const value = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return value ? value.slice(name.length + 1) : "";
}
export const cookieOptions = (config) => ({
  httpOnly: true,
  secure: config.secure,
  sameSite: "lax",
  path: "/",
});
export const sessionName = (config) =>
  config.secure ? "__Host-portal_session" : "portal_session";
export const flowName = (config) =>
  config.secure ? "__Host-portal_oauth" : "portal_oauth";
export function isAllowed(config, email, domain) {
  return (
    (!config.emails.length && !config.domains.length) ||
    config.emails.includes(email.toLowerCase()) ||
    (domain && config.domains.includes(domain.toLowerCase()))
  );
}
export function createSession(db, config, userId) {
  const raw = token();
  const csrf = token();
  const expires = Date.now() + config.sessionHours * 3600000;
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(
    hash(raw),
    userId,
    csrf,
    expires,
  );
  return { raw, csrf, expires };
}
export function upsertGoogleUser(db, config, payload) {
  if (
    !payload.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    !isAllowed(config, payload.email, payload.hd)
  )
    throw new Error("Account is not allowed.");
  const email = payload.email.toLowerCase();
  let user = db
    .prepare("SELECT * FROM users WHERE google_sub = ?")
    .get(payload.sub);
  if (user) {
    db.prepare(
      "UPDATE users SET email = ?, name = ?, domain = ? WHERE id = ?",
    ).run(email, payload.name || email, payload.hd || null, user.id);
  } else {
    const id = randomUUID();
    db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id,
      payload.sub,
      email,
      payload.name || email,
      payload.hd || null,
      config.adminEmails.includes(email) ? "ADMIN" : "VIEWER",
      Date.now(),
    );
    user = { id };
  }
  return db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
}
export function security(db, config) {
  const auth = (req, res, next) => {
    const raw = cookie(req, sessionName(config));
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
      return res.status(401).json({ error: "Please sign in to continue." });
    const row = db
      .prepare(
        `SELECT u.*, s.csrf, s.token_hash, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(hash(raw), Date.now());
    if (!row || !isAllowed(config, row.email, row.domain))
      return res
        .status(401)
        .json({ error: "Your session has expired. Please sign in again." });
    req.user = row;
    next();
  };
  const admin = (req, res, next) =>
    req.user.role === "ADMIN"
      ? next()
      : res.status(403).json({ error: "Administrator access is required." });
  const csrf = (req, res, next) => {
    if (
      req.headers.origin !== config.origin ||
      !equal(req.headers["x-csrf-token"], req.user.csrf)
    )
      return res
        .status(403)
        .json({
          error: "Security check failed. Refresh the page and try again.",
        });
    next();
  };
  return { auth, admin, csrf };
}
