import {
  and,
  createDatabase,
  eq,
  gt,
  isNull,
  or,
  quoteAcceptanceLinks,
  quoteVersions,
  sql,
} from "@andthenn/db";
import { NextResponse } from "next/server";
import { assertRuntimeConfiguration } from "../../../../../lib/config";
import { hashQuoteToken } from "../../../../../lib/security";
import { createStorage } from "../../../../../lib/storage";

const available = (token: string) =>
  and(
    eq(quoteAcceptanceLinks.tokenHash, hashQuoteToken(token)),
    eq(quoteAcceptanceLinks.status, "ACTIVE"),
    or(isNull(quoteAcceptanceLinks.expiresAt), gt(quoteAcceptanceLinks.expiresAt, new Date())),
  );

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertRuntimeConfiguration();
    const { token } = await params;
    const { db } = createDatabase();
    const [quote] = await db
      .select({ storageKey: quoteVersions.pdfStorageKey, versionNumber: quoteVersions.versionNumber })
      .from(quoteAcceptanceLinks)
      .innerJoin(quoteVersions, eq(quoteVersions.id, quoteAcceptanceLinks.quoteVersionId))
      .where(and(available(token), or(isNull(quoteVersions.validUntil), sql`${quoteVersions.validUntil} >= current_date`)))
      .limit(1);
    if (!quote?.storageKey) return NextResponse.json({ error: "Quotation unavailable" }, { status: 404 });
    const object = await createStorage().openRead(quote.storageKey, request.headers.get("range") ?? undefined);
    return new NextResponse(object.body, {
      status: object.contentRange ? 206 : 200,
      headers: {
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
        "content-disposition": `inline; filename*=UTF-8''quote-v${quote.versionNumber}.pdf`,
        "content-length": String(object.contentLength),
        "content-type": "application/pdf",
        ...(object.contentRange ? { "content-range": object.contentRange } : {}),
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Quotation unavailable" }, { status: 404 });
  }
}
