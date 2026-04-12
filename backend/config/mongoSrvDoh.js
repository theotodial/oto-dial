/**
 * When Node's mongodb+srv SRV lookup fails (e.g. querySrv ECONNREFUSED on Windows),
 * resolve Atlas SRV/TXT by other means and build mongodb:// (no SRV at connect).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import https from "node:https";
import axios from "axios";

const execFileAsync = promisify(execFile);

/** Prefer IPv4 — fixes some Windows / dual-stack "fetch failed" issues. */
const ipv4HttpsAgent = new https.Agent({
  family: 4,
  keepAlive: true,
});

const dohAxios = axios.create({
  timeout: 22_000,
  httpsAgent: ipv4HttpsAgent,
  validateStatus: (s) => s >= 200 && s < 300,
  headers: { Accept: "application/dns-json", "User-Agent": "oto-dial-backend/mongoSrvDoh" },
});

/**
 * DoH URLs (hostname form — correct SNI). Tried in order.
 * Set MONGO_DOH_USE_SYSTEM_PROXY=true to use HTTP(S)_PROXY for these (default: no proxy).
 */
function buildDohUrlList(name, type) {
  const enc = encodeURIComponent(name);
  return [
    `https://dns.google/resolve?name=${enc}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${enc}&type=${type}`,
    `https://mozilla.cloudflare-dns.com/dns-query?name=${enc}&type=${type}`,
    `https://dns9.quad9.net/dns-query?name=${enc}&type=${type}`,
  ];
}

async function fetchDnsJsonAxios(name, type) {
  const useProxy = process.env.MONGO_DOH_USE_SYSTEM_PROXY === "true";
  const errors = [];
  for (const url of buildDohUrlList(name, type)) {
    try {
      const res = await dohAxios.get(url, useProxy ? {} : { proxy: false });
      const json = res.data;
      if (json.Status !== 0) {
        errors.push(`${url} status=${json.Status}`);
        continue;
      }
      return { Answer: json.Answer || [] };
    } catch (e) {
      errors.push(e?.message || String(e));
    }
  }
  const err = new Error(`DoH failed for ${name} type ${type}: ${errors.join(" | ")}`);
  err.causes = errors;
  throw err;
}

function escapePsSingle(s) {
  return String(s).replace(/'/g, "''");
}

/**
 * Windows DNS API via PowerShell — often works when Node querySrv does not.
 */
async function resolveSrvPowerShell(srvName) {
  if (process.platform !== "win32") return null;
  const safe = escapePsSingle(srvName);
  const cmd = `(Resolve-DnsName -Type SRV -Name '${safe}' -DnsOnly -ErrorAction SilentlyContinue | Select-Object NameTarget,Port,Priority,Weight | ConvertTo-Json -Compress)`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
      { timeout: 25_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
    );
    const t = String(stdout || "").replace(/^\uFEFF/, "").trim();
    if (!t || t === "null") return null;
    const data = JSON.parse(t);
    const arr = Array.isArray(data) ? data : [data];
    const out = [];
    for (const x of arr) {
      if (!x?.NameTarget || x.Port == null) continue;
      out.push({
        priority: Number(x.Priority) || 0,
        weight: Number(x.Weight) || 0,
        port: Number(x.Port),
        target: String(x.NameTarget).replace(/\.$/, ""),
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

async function resolveTxtPowerShell(srvName) {
  if (process.platform !== "win32") return "";
  const safe = escapePsSingle(srvName);
  const cmd = `$r = Resolve-DnsName -Type TXT -Name '${safe}' -DnsOnly -ErrorAction SilentlyContinue; if ($null -eq $r) { '' } else { ($r | ForEach-Object { $_.Strings -join '' }) -join '' }`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
      { timeout: 25_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
    );
    return String(stdout || "").trim().replace(/\r?\n/g, "");
  } catch {
    return "";
  }
}

function parseNslookupSrv(stdout) {
  const records = [];
  let lastPort = null;
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const pm = line.match(/port\s*=\s*(\d+)/i);
    if (pm) lastPort = Number(pm[1]);
    const hm =
      line.match(/svr hostname\s*=\s*(\S+)/i) ||
      line.match(/hostname\s*=\s*(\S+)/i);
    if (hm && lastPort != null) {
      records.push({
        priority: 0,
        weight: 0,
        port: lastPort,
        target: hm[1].replace(/\.$/, ""),
      });
      lastPort = null;
    }
  }
  return records.length ? records : null;
}

async function resolveSrvNslookup(srvName) {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync(
      "nslookup",
      ["-type=srv", srvName],
      { timeout: 25_000, windowsHide: true, maxBuffer: 512 * 1024 }
    );
    return parseNslookupSrv(stdout);
  } catch {
    return null;
  }
}

function parseSrvDataLine(data) {
  const s = String(data || "").trim();
  const parts = s.split(/\s+/);
  if (parts.length < 4) return null;
  const priority = Number(parts[0]);
  const weight = Number(parts[1]);
  const port = Number(parts[2]);
  const target = parts.slice(3).join(" ").replace(/\.$/, "");
  if (!target || !Number.isFinite(port)) return null;
  return { priority, weight, port, target };
}

function unwrapTxtData(data) {
  let s = String(data ?? "");
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      s = JSON.parse(s);
    } catch {
      s = s.slice(1, -1);
    }
  }
  return s.replace(/^"|"$/g, "");
}

function safeDecodeParam(s) {
  try {
    return decodeURIComponent(String(s).replace(/\+/g, " "));
  } catch {
    return String(s);
  }
}

async function resolveSrvRecords(srvName) {
  let list =
    (await resolveSrvPowerShell(srvName)) ||
    (await resolveSrvNslookup(srvName));
  if (list?.length) {
    console.log(`[MongoDB] SRV resolved via Windows resolver (${list.length} host(s))`);
    return list;
  }
  const { Answer } = await fetchDnsJsonAxios(srvName, "SRV");
  const srvRecords = [];
  for (const a of Answer) {
    if (a.type !== 33) continue;
    const rec = parseSrvDataLine(a.data);
    if (rec) srvRecords.push(rec);
  }
  if (srvRecords.length) {
    console.log(`[MongoDB] SRV resolved via DNS-over-HTTPS (${srvRecords.length} host(s))`);
  }
  return srvRecords;
}

async function resolveTxtRecords(srvName) {
  let txtExtra = await resolveTxtPowerShell(srvName);
  if (txtExtra) {
    console.log("[MongoDB] TXT resolved via PowerShell");
    return txtExtra;
  }
  try {
    const { Answer } = await fetchDnsJsonAxios(srvName, "TXT");
    const chunks = [];
    for (const a of Answer) {
      if (a.type !== 16) continue;
      chunks.push(unwrapTxtData(a.data));
    }
    txtExtra = chunks.join("");
    if (txtExtra) console.log("[MongoDB] TXT resolved via DNS-over-HTTPS");
  } catch {
    /* optional */
  }
  return txtExtra || "";
}

/**
 * @param {string} srvUri mongodb+srv://...
 * @returns {Promise<string|null>} mongodb://... or null
 */
export async function convertMongoSrvToDirectUri(srvUri) {
  if (!srvUri || typeof srvUri !== "string") return null;
  if (!srvUri.toLowerCase().startsWith("mongodb+srv://")) return null;

  let parsed;
  try {
    parsed = new URL(srvUri.replace(/^mongodb\+srv:\/\//i, "https://"));
  } catch {
    return null;
  }

  const user = decodeURIComponent(parsed.username || "");
  const pass = decodeURIComponent(parsed.password || "");
  const hostname = parsed.hostname;
  if (!hostname) return null;

  const dbPath = (parsed.pathname || "").replace(/^\//, "");
  const existingQs = new URLSearchParams(parsed.search || "");

  const srvName = `_mongodb._tcp.${hostname}`;

  const srvRecords = await resolveSrvRecords(srvName);
  if (!srvRecords.length) return null;

  srvRecords.sort(
    (a, b) => a.priority - b.priority || b.weight - a.weight
  );

  const txtExtra = await resolveTxtRecords(srvName);

  const hostList = srvRecords.map((r) => `${r.target}:${r.port}`).join(",");

  const merged = new URLSearchParams();
  if (txtExtra) {
    for (const part of txtExtra.split("&")) {
      if (!part) continue;
      const eq = part.indexOf("=");
      const k = eq >= 0 ? part.slice(0, eq) : part;
      const v = eq >= 0 ? part.slice(eq + 1) : "";
      if (k) merged.set(k, safeDecodeParam(v));
    }
  }
  existingQs.forEach((v, k) => merged.set(k, v));
  if (!merged.has("tls") && !merged.has("ssl")) {
    merged.set("tls", "true");
  }

  const qs = merged.toString();
  const auth =
    user !== ""
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : "";

  const pathSeg = dbPath ? `/${dbPath}` : "";
  return `mongodb://${auth}${hostList}${pathSeg}${qs ? `?${qs}` : ""}`;
}
