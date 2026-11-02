import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

describe("csp", () => {
  it("locks scripts to the nonce and blocks framing", () => {
    const p = buildCsp("abc", false);
    expect(p).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(p).not.toContain("'unsafe-eval'");
    expect(p).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
    expect(buildCsp("abc", true)).toContain("'unsafe-eval'");
  });
});
