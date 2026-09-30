import { NextResponse, type NextRequest } from "next/server";
import { isPersonaSessionRequestAllowed, PROTOTYPE_SESSION_COOKIE, prototypePersonas, REVIEW_PERSONA_COOKIE, signPrototypeSession } from "../../../../lib/prototype";
import { reviewRuntimeEnabled } from "../../../../lib/config";

export async function POST(request: NextRequest) {
  if (!isPersonaSessionRequestAllowed(request.headers.get("host"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const formSubmission = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ?? false;
  const persona = formSubmission
    ? await request.formData().then((body) => body.get("persona")).catch(() => null)
    : await request.json().then((body) => (body as { persona?: keyof typeof prototypePersonas }).persona).catch(() => null);
  if (typeof persona !== "string" || !(persona in prototypePersonas)) return NextResponse.json({ error: "Choose a valid prototype persona." }, { status: 400 });
  const response = formSubmission
    ? NextResponse.redirect(new URL("/home", request.url), { status: 303 })
    : NextResponse.json({ ok: true, redirectTo: "/home" });
  response.cookies.set(PROTOTYPE_SESSION_COOKIE, signPrototypeSession(persona as keyof typeof prototypePersonas), { httpOnly: true, sameSite: "lax", secure: reviewRuntimeEnabled() || request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 12 });
  if (reviewRuntimeEnabled()) response.cookies.set(REVIEW_PERSONA_COOKIE, persona, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 12 });
  return response;
}

export function DELETE(request: NextRequest) {
  if (!isPersonaSessionRequestAllowed(request.headers.get("host"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PROTOTYPE_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(REVIEW_PERSONA_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
