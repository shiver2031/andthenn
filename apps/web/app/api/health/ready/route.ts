import { NextResponse } from "next/server";
import { readiness } from "../../../../lib/health";

export async function GET() {
  const result = await readiness();
  return NextResponse.json(
    { status: result.ready ? "ok" : "unready", service: "andthenn-web", checks: result.checks },
    { status: result.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
