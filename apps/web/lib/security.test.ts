import { describe, expect, it } from "vitest";
import { publicRateLimitSubject } from "./security";

describe("publicRateLimitSubject", () => {
  it("is stable for a client/token pair and never exposes either input", () => {
    const request = new Request("https://erp.example/review/secret", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" } });
    const key = publicRateLimitSubject(request, "secret");
    expect(key).toHaveLength(64);
    expect(key).toBe(publicRateLimitSubject(request, "secret"));
    expect(key).not.toContain("203.0.113.10");
    expect(key).not.toContain("secret");
  });

  it("keeps different opaque tokens in independent buckets", () => {
    const request = new Request("https://erp.example");
    expect(publicRateLimitSubject(request, "a")).not.toBe(publicRateLimitSubject(request, "b"));
  });

  it("also derives a token-independent client bucket", () => {
    const request = new Request("https://erp.example", { headers: { "x-real-ip": "203.0.113.12" } });
    expect(publicRateLimitSubject(request)).toBe(publicRateLimitSubject(request));
    expect(publicRateLimitSubject(request)).not.toBe(publicRateLimitSubject(request, "review-token"));
  });
});
