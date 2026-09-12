import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
const list = (value = "") =>
  value
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
function number(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Configuration number must be between ${min} and ${max}.`);
  return n;
}
export function readConfig(env = process.env) {
  const origin = new URL(env.APP_ORIGIN || "http://localhost:3000");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("APP_ORIGIN must be an HTTP(S) origin without a path.");
  const production = env.NODE_ENV === "production";
  const domains = list(env.ALLOWED_GOOGLE_DOMAINS);
  const emails = list(env.ALLOWED_EMAILS);
  if (production && origin.protocol !== "https:")
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  const dataDir = path.resolve(ROOT, env.DATA_DIR || "data");
  if (
    dataDir === ROOT ||
    ["dist", "public", "src", "server"].some(
      (dir) =>
        dataDir === path.join(ROOT, dir) ||
        dataDir.startsWith(path.join(ROOT, dir) + path.sep),
    )
  )
    throw new Error(
      "DATA_DIR must be private and separate from source/public assets.",
    );
  return {
    production,
    origin: origin.origin,
    secure: origin.protocol === "https:",
    port: number(env.PORT, 3000, 1, 65535),
    dataDir,
    clientId: env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_CLIENT_SECRET || "",
    adminEmails: list(env.ADMIN_EMAILS),
    domains,
    emails,
    sessionHours: number(env.SESSION_HOURS, 8, 1, 168),
    streamTTL: number(env.STREAM_TTL_SECONDS, 300, 30, 3600),
    trustProxy: number(env.TRUST_PROXY_HOPS, 0, 0, 5),
  };
}
