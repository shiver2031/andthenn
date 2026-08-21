import { NextResponse } from "next/server";
import { createManualIntake } from "../../../(erp)/intake/actions";

/** Offline capture sync boundary. It deliberately accepts text only until a
 * dedicated intake-object storage writer is available; files remain queued on-device. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { title?: unknown; summary?: unknown; capturedAt?: unknown } | null;
  if (!body || typeof body.summary !== "string" || body.summary.trim().length === 0) return NextResponse.json({ error: "A request summary is required" }, { status: 400 });
  const form = new FormData();
  form.set("title", typeof body.title === "string" ? body.title : ""); form.set("summary", body.summary);
  form.set("capturedAt", typeof body.capturedAt === "string" ? body.capturedAt : new Date().toISOString());
  try { await createManualIntake(form); return NextResponse.json({ accepted: true }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to capture request" }, { status: 400 }); }
}
