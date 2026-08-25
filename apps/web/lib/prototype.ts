import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prototypeRuntimeEnabled, reviewRuntimeEnabled } from "./config";

export const PROTOTYPE_SESSION_COOKIE = "andthenn_prototype_session";
export const REVIEW_PERSONA_COOKIE = "andthenn_review_persona";

export const prototypePersonas = {
  manager: { authUserId: "10000000-0000-4000-8000-000000000001", label: "Manager · Mira Shah" },
  employee: { authUserId: "10000000-0000-4000-8000-000000000002", label: "Employee · Arjun Menon" },
  temporary: { authUserId: "10000000-0000-4000-8000-000000000004", label: "Temporary · Kabir Rao" },
  expired: { authUserId: "10000000-0000-4000-8000-000000000005", label: "Expired temporary · Nikhil Das" },
} as const;

export type PrototypePersona = keyof typeof prototypePersonas;

function secret() {
  return reviewRuntimeEnabled()
    ? process.env.REVIEW_SIGNING_SECRET ?? ""
    : process.env.PROTOTYPE_SIGNING_SECRET ?? "andthenn-local-prototype-secret";
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signPrototypeSession(persona: PrototypePersona, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ persona, iat: Math.floor(now / 1_000), exp: Math.floor(now / 1_000) + 60 * 60 * 12 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyPrototypeSession(value: string | undefined, now = Date.now()): PrototypePersona | null {
  if (!value || (!prototypeRuntimeEnabled() && !reviewRuntimeEnabled())) return null;
  const [payload, supplied] = value.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { persona?: PrototypePersona; exp?: number };
    return parsed.persona && parsed.persona in prototypePersonas && typeof parsed.exp === "number" && parsed.exp * 1_000 > now ? parsed.persona : null;
  } catch { return null; }
}

export async function prototypePersonaFromCookies() {
  const requestCookies = await cookies();
  const signedPersona = verifyPrototypeSession(requestCookies.get(PROTOTYPE_SESSION_COOKIE)?.value);
  if (signedPersona) return signedPersona;
  // The hosted review environment intentionally has no identity provider: a
  // visitor may select any supplied demo persona. This avoids coupling the
  // review experience to a signing secret across independently deployed
  // functions while keeping real and local-prototype sessions signed.
  const reviewPersona = requestCookies.get(REVIEW_PERSONA_COOKIE)?.value;
  return reviewRuntimeEnabled() && reviewPersona && reviewPersona in prototypePersonas
    ? reviewPersona as PrototypePersona
    : null;
}

export function isPrototypeRequestAllowed(host: string | null) {
  return prototypeRuntimeEnabled() && !!host && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

export function isPersonaSessionRequestAllowed(host: string | null) {
  return reviewRuntimeEnabled() || isPrototypeRequestAllowed(host);
}
