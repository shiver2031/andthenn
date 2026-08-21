import { describe, expect, it } from "vitest";
import { applicationOrigin, assertRuntimeConfiguration, configurationProblems, demoModeEnabled } from "./config";

const configured: NodeJS.ProcessEnv = {
  NODE_ENV: "production", APP_URL: "https://erp.andthenn.example", DATABASE_URL: "postgresql://db", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_S3_ENDPOINT: "https://project.storage", SUPABASE_S3_ACCESS_KEY_ID: "key",
  SUPABASE_S3_SECRET_ACCESS_KEY: "secret", SUPABASE_STORAGE_BUCKET: "media", REVIEW_TOKEN_PEPPER: "a-secure-pepper",
};

describe("runtime configuration", () => {
  it("rejects missing and placeholder production secrets", () => {
    expect(configurationProblems({ ...configured, REVIEW_TOKEN_PEPPER: "replace-with-a-secret" })).toContain("REVIEW_TOKEN_PEPPER");
    expect(() => assertRuntimeConfiguration({ ...configured, DATABASE_URL: "" })).toThrow("DATABASE_URL");
  });
  it("does not permit demo mode in production", () => {
    expect(demoModeEnabled({ NODE_ENV: "production", ALLOW_DEMO_MODE: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(() => assertRuntimeConfiguration({ ...configured, ALLOW_DEMO_MODE: "true" })).toThrow("not permitted");
  });
  it("requires an explicit local opt-in for demo mode", () => {
    expect(() => assertRuntimeConfiguration({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toThrow();
    expect(() => assertRuntimeConfiguration({ NODE_ENV: "development", ALLOW_DEMO_MODE: "true" } as NodeJS.ProcessEnv)).not.toThrow();
  });
  it("requires a canonical application origin and HTTPS in production", () => {
    expect(applicationOrigin(configured)).toBe("https://erp.andthenn.example");
    expect(configurationProblems({ ...configured, APP_URL: "http://erp.andthenn.example" })).toContain("APP_URL");
    expect(configurationProblems({ ...configured, APP_URL: "https://erp.andthenn.example/path" })).toContain("APP_URL");
  });
});
