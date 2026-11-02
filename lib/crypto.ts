import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const DEV_KEY_SEED = "moneypilot-dev-only-key";

/** Accepts a 32-byte key as base64 or 64 hex chars. */
export function parseKey(raw: string): Buffer {
  const hex = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : null;
  const key = hex ?? Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex chars)");
  return key;
}

let warned = false;
function resolveKey(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (raw) return parseKey(raw);
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY is required in production to store secrets");
  }
  if (!warned) {
    console.warn("[crypto] ENCRYPTION_KEY unset; using an insecure dev-only key");
    warned = true;
  }
  return scryptSync(DEV_KEY_SEED, "moneypilot", 32);
}

/** AES-256-GCM. Output: `v1:<base64url(iv12 | tag16 | ciphertext)>`. */
export function encrypt(plaintext: string, key: Buffer = resolveKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url")}`;
}

export function decrypt(payload: string, key: Buffer = resolveKey()): string {
  const [version, body] = payload.split(":");
  if (version !== VERSION || !body) throw new Error("Unsupported ciphertext format");
  const buf = Buffer.from(body, "base64url");
  if (buf.length < 29) throw new Error("Ciphertext too short");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** SHA-256 hex, for storing tokens and recovery codes. */
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
