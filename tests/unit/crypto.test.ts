import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, parseKey, safeEqual, sha256 } from "@/lib/crypto";

const key = randomBytes(32);

describe("crypto", () => {
  it("round-trips text", () => {
    const secret = "access-sandbox-1234 ✓";
    const ct = encrypt(secret, key);
    expect(ct.startsWith("v1:")).toBe(true);
    expect(ct).not.toContain("access");
    expect(decrypt(ct, key)).toBe(secret);
  });

  it("uses a fresh IV every time", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const ct = encrypt("hello", key);
    const buf = Buffer.from(ct.slice(3), "base64url");
    buf[buf.length - 1] ^= 1;
    expect(() => decrypt(`v1:${buf.toString("base64url")}`, key)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("hello", key), randomBytes(32))).toThrow();
  });

  it("rejects unknown formats", () => {
    expect(() => decrypt("v2:abc", key)).toThrow(/format/);
    expect(() => decrypt("v1:abc", key)).toThrow(/short/);
  });

  it("parses hex and base64 keys, rejects bad lengths", () => {
    expect(parseKey(key.toString("hex")).equals(key)).toBe(true);
    expect(parseKey(key.toString("base64")).equals(key)).toBe(true);
    expect(() => parseKey("short")).toThrow();
  });

  it("falls back to a dev key outside production", () => {
    expect(decrypt(encrypt("dev"))).toBe("dev");
  });

  it("hashes and compares", () => {
    expect(sha256("a")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
