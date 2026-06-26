/**
 * Free TCP port before local dev (Windows-friendly).
 * Usage: node scripts/freeDevPort.js [port]
 */
import { execSync } from "node:child_process";

const port = Number(process.argv[2] || process.env.PORT || 5000);
if (!Number.isFinite(port) || port <= 0) {
  console.error("[freeDevPort] invalid port");
  process.exit(1);
}

function listPidsOnPort(p) {
  try {
    const out = execSync(`netstat -ano | findstr ":${p}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

const pids = listPidsOnPort(port);
if (!pids.length) {
  console.log(`[freeDevPort] port ${port} is already free`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    console.log(`[freeDevPort] killed pid ${pid} on port ${port}`);
  } catch {
    console.warn(`[freeDevPort] could not kill pid ${pid}`);
  }
}
