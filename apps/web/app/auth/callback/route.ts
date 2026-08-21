import { NextResponse } from "next/server";
import { applicationOrigin } from "../../../lib/config";
import { safeInternalPath } from "../../../lib/route-policy";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = safeInternalPath(next);
  const origin = applicationOrigin();
  if (!origin) return NextResponse.redirect(new URL("/login?error=config", url.origin));
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase?.auth.exchangeCodeForSession(code) ?? { error: new Error("Authentication is not configured") };
    if (!error) return NextResponse.redirect(new URL(safeNext, origin));
  }
  return NextResponse.redirect(new URL("/login?error=oauth", origin));
}
