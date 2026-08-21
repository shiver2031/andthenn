/** Runtime configuration is deliberately validated at the boundary, not silently
 * replaced with showcase values.  Local demo data is opt-in and can never be
 * enabled in a production process. */
const PLACEHOLDER = /^(?:replace|stub|changeme|example|your[_-]?)/i;

export function prototypeRuntimeEnabled(env = process.env) {
  return env.APP_RUNTIME === "prototype";
}

export function isLoopbackOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch { return false; }
}

const required = [
  "APP_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_S3_ENDPOINT",
  "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "REVIEW_TOKEN_PEPPER",
] as const;

function invalid(value: string | undefined) {
  return !value || PLACEHOLDER.test(value) || value.includes("replace-with");
}

/** The only authority allowed when generating external links or post-auth redirects. */
export function applicationOrigin(env = process.env): string | null {
  const value = env.APP_URL;
  if (invalid(value)) return null;
  try {
    const parsed = new URL(value!);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    if (env.NODE_ENV === "production" && parsed.protocol !== "https:") return null;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function demoModeEnabled(env = process.env) {
  return env.NODE_ENV !== "production" && env.ALLOW_DEMO_MODE === "true";
}

export function configurationProblems(env = process.env): string[] {
  if (prototypeRuntimeEnabled(env)) {
    return isLoopbackOrigin(env.APP_URL ?? null) ? [] : ["APP_URL must be a loopback origin in prototype runtime"];
  }
  const problems = required.filter((name) => invalid(env[name]));
  if (!applicationOrigin(env) && !problems.includes("APP_URL")) problems.push("APP_URL");
  return problems;
}

export function assertRuntimeConfiguration(env = process.env) {
  const problems = configurationProblems(env);
  if (problems.length > 0 && !demoModeEnabled(env)) {
    throw new Error(`Missing or placeholder critical configuration: ${problems.join(", ")}`);
  }
  if (env.NODE_ENV === "production" && env.ALLOW_DEMO_MODE === "true") {
    throw new Error("ALLOW_DEMO_MODE is not permitted in production");
  }
  if (prototypeRuntimeEnabled(env) && !isLoopbackOrigin(env.APP_URL ?? null)) {
    throw new Error("Prototype runtime must use a loopback APP_URL");
  }
}

export function runtimeConfigurationIsValid(env = process.env) {
  try { assertRuntimeConfiguration(env); return true; } catch { return false; }
}

/** Provider callbacks are public entry points and therefore need their own
 * explicit configuration contract in addition to the core runtime contract. */
export function assertProviderConfiguration(provider: "gmail" | "whatsapp", env = process.env) {
  assertRuntimeConfiguration(env);
  const requiredForProvider = provider === "gmail"
    ? ["ORGANIZATION_ID", "GOOGLE_WORKSPACE_INTAKE_EMAIL", "GOOGLE_PUBSUB_VERIFICATION_AUDIENCE", "GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL"]
    : ["ORGANIZATION_ID", "META_WHATSAPP_APP_SECRET", "META_WHATSAPP_VERIFY_TOKEN", "META_WHATSAPP_PHONE_NUMBER_ID", "META_WHATSAPP_ACCESS_TOKEN"];
  const problems = requiredForProvider.filter((name) => invalid(env[name]));
  if (problems.length) throw new Error(`Missing provider configuration: ${problems.join(", ")}`);
}
