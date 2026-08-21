import { describe, expect, it } from "vitest";
import { isPublicRoute, loginPathFor, safeInternalPath } from "./route-policy";

describe("route policy", () => {
  it("keeps authentication, public-token, health, and provider paths outside ERP login redirects", () => {
    for (const pathname of ["/login", "/auth/callback", "/reset-password", "/review/token", "/quote/token", "/api/health/ready", "/api/webhooks/gmail"]) {
      expect(isPublicRoute(pathname)).toBe(true);
    }
    expect(isPublicRoute("/projects")).toBe(false);
    expect(isPublicRoute("/login-admin")).toBe(false);
    expect(isPublicRoute("/api/healthcheck")).toBe(false);
  });

  it("permits only internal paths after sign-in", () => {
    expect(safeInternalPath("/projects?view=board#tasks")).toBe("/projects?view=board#tasks");
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "/auth/callback", "/review/token", "/%2f%2fevil.example"]) {
      expect(safeInternalPath(value)).toBe("/home");
    }
  });

  it("preserves a safe requested internal path in the login redirect", () => {
    expect(loginPathFor("/projects", "?view=board")).toBe("/login?next=%2Fprojects%3Fview%3Dboard");
  });
});
