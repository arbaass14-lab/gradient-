import fs from "node:fs";
import path from "node:path";
import { loadEnv, readConfig, ROOT } from "./config.js";
import { openDatabase, cleanExpired } from "./db.js";
import { createApp, errorHandler } from "./app.js";

loadEnv();
const config = readConfig();
const dev = process.argv.includes("--dev");
if (dev && config.production)
  throw new Error("Do not run the development server in production.");
if (!dev && !fs.existsSync(path.join(ROOT, "dist/index.html")))
  throw new Error("Build the interface first: npm run build");
if (config.production && (!config.clientId || !config.clientSecret))
  throw new Error("Production requires Google OAuth credentials.");
const db = openDatabase(config.dataDir);
cleanExpired(db);
const app = createApp({ db, config, dev });
let vite;
if (dev) {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true, hmr: false },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(errorHandler);
const timer = setInterval(() => cleanExpired(db), 60000).unref();
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Training portal is ready at ${config.origin}`);
  if (!config.clientId || !config.clientSecret)
    console.log(
      "Add your Google OAuth client ID and secret to .env to enable sign-in.",
    );
});
server.requestTimeout = 10 * 60000;
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${config.port} is in use. Stop the other server or change PORT and APP_ORIGIN together.`
      : "Server could not start.",
  );
  process.exit(1);
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  server.close(async () => {
    await vite?.close();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
