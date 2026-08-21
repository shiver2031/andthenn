import { LocalFilesystemStorage } from "@andthenn/adapters";
import { NextResponse, type NextRequest } from "next/server";
import { isPrototypeRequestAllowed } from "../../../../../lib/prototype";

function storage(request: NextRequest) {
  if (!isPrototypeRequestAllowed(request.headers.get("host"))) return null;
  return new LocalFilesystemStorage();
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ ticket: string }> }) {
  const provider = storage(request); if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try { const value = await provider.putTicket((await params).ticket, new Uint8Array(await request.arrayBuffer())); return NextResponse.json({ ok: true, key: value.key }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Upload rejected" }, { status: 409 }); }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ ticket: string }> }) {
  const provider = storage(request); if (!provider) return new NextResponse("Not found", { status: 404 });
  const value = provider.verifyTicket((await params).ticket);
  if (!value || value.mode !== "GET") return new NextResponse("Unavailable", { status: 404 });
  try { const result = await provider.openRead(value.key, request.headers.get("range") ?? undefined); return new NextResponse(result.body, { status: result.contentRange ? 206 : 200, headers: { "content-type": result.contentType, "content-length": String(result.contentLength), "accept-ranges": "bytes", ...(result.contentRange ? { "content-range": result.contentRange } : {}), ...(result.etag ? { etag: result.etag } : {}) } }); }
  catch { return new NextResponse("Unavailable", { status: 404 }); }
}
