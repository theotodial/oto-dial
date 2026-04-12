/**
 * Load environment variables FIRST (import this before any other app code from index.js).
 * Merges multiple .env locations so RESEND_API_KEY works whether .env lives in backend/ or repo root.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const backendEnvPath = path.resolve(path.join(backendRoot, ".env"));
const rootEnvPath = path.resolve(path.join(backendRoot, "..", ".env"));
const cwdEnvPath = path.resolve(path.join(process.cwd(), ".env"));

/**
 * Lower-priority .env first, then backend/.env last with override so values in
 * backend/.env always win over repo-root or cwd .env (fixes empty TEST_EMAIL_TO
 * when root `.env` defines TEST_EMAIL_TO= with no value).
 */
const lowerPriorityEnvPaths = [cwdEnvPath, rootEnvPath].filter(
  (p) => p !== backendEnvPath
);

const loaded = [];
for (const abs of lowerPriorityEnvPaths) {
  if (fs.existsSync(abs)) {
    dotenv.config({ path: abs, override: true });
    loaded.push(abs);
  }
}

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
  loaded.push(backendEnvPath);
}

if (loaded.length === 0) {
  dotenv.config({ override: true });
  console.warn(
    "⚠️ No .env file found. Checked:",
    [cwdEnvPath, rootEnvPath, backendEnvPath].join(", ")
  );
} else {
  console.log("📂 Loaded .env (backend wins):", loaded.join(" → "));
}

/** Strip wrapping quotes (common mistake: RESEND_API_KEY="re_...") */
function stripEnvQuotes(val) {
  if (val == null) return "";
  let s = String(val).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

if (process.env.RESEND_API_KEY !== undefined) {
  process.env.RESEND_API_KEY = stripEnvQuotes(process.env.RESEND_API_KEY);
}
for (const key of ["TEST_EMAIL_TO", "RESEND_FROM", "RESEND_REPLY_TO"]) {
  if (process.env[key] !== undefined) {
    process.env[key] = stripEnvQuotes(process.env[key]);
  }
}
