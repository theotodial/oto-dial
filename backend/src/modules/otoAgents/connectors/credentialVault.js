import crypto from "crypto";

function getKey() {
  const raw = String(process.env.OTO_AGENTS_ENCRYPTION_KEY || process.env.JWT_SECRET || "").trim();
  return crypto.createHash("sha256").update(raw || "oto-agents-local-development-key").digest();
}

export function encryptSecret(value) {
  if (value == null || value === "") return { iv: null, tag: null, data: null };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function redactSocialAccount(account) {
  if (!account) return null;
  const obj = typeof account.toSafeJSON === "function" ? account.toSafeJSON() : { ...account };
  delete obj.encryptedCredentials;
  if (obj.tokens) {
    obj.tokens = {
      hasAccessToken: Boolean(obj.tokens.encryptedAccessToken),
      hasRefreshToken: Boolean(obj.tokens.encryptedRefreshToken),
      expiresAt: obj.tokens.expiresAt || null,
      scopes: obj.tokens.scopes || [],
    };
  }
  return obj;
}
