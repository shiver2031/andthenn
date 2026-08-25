import { NextResponse, type NextRequest } from "next/server";
import { isPersonaSessionRequestAllowed, PROTOTYPE_SESSION_COOKIE, prototypePersonas, signPrototypeSession } from "../../../../lib/prototype";
import { reviewRuntimeEnabled } from "../../../../lib/config";

export async function POST(request: NextRequest) {
  if (!isPersonaSessionRequestAllowed(request.headers.get("host"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { persona?: keyof typeof prototypePersonas } | null;
  if (!body?.persona || !(body.persona in prototypePersonas)) return NextResponse.json({ error: "Choose a valid prototype persona." }, { status: 400 });
  const response = NextResponse.json({ ok: true, redirectTo: "/home" });
  response.cookies.set(PROTOTYPE_SESSION_COOKIE, signPrototypeSession(body.persona), { httpOnly: true, sameSite: "lax", secure: reviewRuntimeEnabled() || request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}

export function DELETE(request: NextRequest) {
  if (!isPersonaSessionRequestAllowed(request.headers.get("host"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PROTOTYPE_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
