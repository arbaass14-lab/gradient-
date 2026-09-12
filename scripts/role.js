import { loadEnv, readConfig } from "../server/config.js";
import { openDatabase } from "../server/db.js";
loadEnv();
const [email, role] = process.argv.slice(2);
if (!email || !["ADMIN", "VIEWER"].includes(role)) {
  console.error("Usage: npm run role -- person@example.com ADMIN (or VIEWER)");
  process.exit(1);
}
const db = openDatabase(readConfig().dataDir);
const users = db
  .prepare("SELECT id FROM users WHERE email = ?")
  .all(email.toLowerCase());
if (users.length !== 1) {
  console.error(
    "Expected exactly one existing user. Ask them to sign in with Google first.",
  );
  db.close();
  process.exit(1);
}
db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, users[0].id);
console.log(
  `Role updated to ${role}. It takes effect on the next API request; refresh the browser interface.`,
);
db.close();
