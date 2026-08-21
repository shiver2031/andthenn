import {
  and,
  clients,
  createDatabase,
  eq,
  gt,
  isNull,
  or,
  quoteAcceptanceEvents,
  quoteAcceptanceLinks,
  quoteLines,
  quotes,
  quoteVersions,
  sql,
} from "@andthenn/db";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { assertRuntimeConfiguration } from "../../../../lib/config";
import { consumePublicRateLimit, hashQuoteToken } from "../../../../lib/security";

const available = (token: string) =>
  and(
    eq(quoteAcceptanceLinks.tokenHash, hashQuoteToken(token)),
    eq(quoteAcceptanceLinks.status, "ACTIVE"),
    or(
      isNull(quoteAcceptanceLinks.expiresAt),
      gt(quoteAcceptanceLinks.expiresAt, new Date()),
    ),
  );

async function load(token: string) {
  const { db } = createDatabase();
  const [row] = await db
    .select({
      linkId: quoteAcceptanceLinks.id,
      organizationId: quoteAcceptanceLinks.organizationId,
      expiresAt: quoteAcceptanceLinks.expiresAt,
      quoteVersionId: quoteVersions.id,
      versionNumber: quoteVersions.versionNumber,
      validUntil: quoteVersions.validUntil,
      subtotalMinor: quoteVersions.subtotalMinor,
      discountMinor: quoteVersions.discountMinor,
      taxMinor: quoteVersions.taxMinor,
      totalMinor: quoteVersions.totalMinor,
      pdfStorageKey: quoteVersions.pdfStorageKey,
      pdfChecksumSha256: quoteVersions.pdfChecksumSha256,
      legalSnapshot: quoteVersions.legalSnapshot,
      currency: quotes.currency,
      quoteId: quotes.id,
      clientName: clients.name,
    })
    .from(quoteAcceptanceLinks)
    .innerJoin(
      quoteVersions,
      eq(quoteVersions.id, quoteAcceptanceLinks.quoteVersionId),
    )
    .innerJoin(quotes, eq(quotes.id, quoteVersions.quoteId))
    .innerJoin(clients, eq(clients.id, quotes.clientId))
    .where(and(available(token), or(isNull(quoteVersions.validUntil), sql`${quoteVersions.validUntil} >= current_date`)))
    .limit(1);
  if (!row?.pdfStorageKey || !row.pdfChecksumSha256) return null;
  return { db, row };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertRuntimeConfiguration();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const { token } = await params;
  if (!await consumePublicRateLimit(request, "quote.view", token, 60, 60)) {
    return NextResponse.json({ error: "Too many requests; try again shortly" }, { status: 429, headers: { "retry-after": "60" } });
  }
  const loaded = await load(token);
  if (!loaded)
    return NextResponse.json(
      { error: "Quotation unavailable" },
      { status: 404 },
    );
  const { db, row } = loaded;
  const lines = await db
    .select({
      position: quoteLines.position,
      description: quoteLines.finalDescription,
      quantity: quoteLines.quantity,
      unitRateMinor: quoteLines.unitRateMinor,
      discountBasisPoints: quoteLines.discountBasisPoints,
      taxBasisPoints: quoteLines.taxBasisPoints,
      lineTotalMinor: quoteLines.lineTotalMinor,
    })
    .from(quoteLines)
    .where(eq(quoteLines.quoteVersionId, row.quoteVersionId))
    .orderBy(quoteLines.position);
  const forwarded =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown",
    ipHash = createHash("sha256").update(forwarded).digest("hex");
  await db
    .insert(quoteAcceptanceEvents)
    .values({
      organizationId: row.organizationId,
      acceptanceLinkId: row.linkId,
      eventType: "VIEWED",
      evidence: { ipHash, userAgent: request.headers.get("user-agent") },
    });
  const pdfUrl = `/api/quote/${encodeURIComponent(token)}/pdf`;
  const {
    organizationId: _organizationId,
    pdfStorageKey: _pdfStorageKey,
    quoteId: _quoteId,
    ...publicRow
  } = row;
  return NextResponse.json({ ...publicRow, lines, pdfUrl });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertRuntimeConfiguration();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    email?: unknown;
    confirmed?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "",
    email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (
    name.length < 2 ||
    name.length > 160 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    body?.confirmed !== true
  )
    return NextResponse.json(
      { error: "Name, valid email and explicit confirmation are required" },
      { status: 400 },
    );
  const { token } = await params;
  if (!await consumePublicRateLimit(request, "quote.accept", token, 10, 3_600)) {
    return NextResponse.json({ error: "Too many acceptance attempts; try again later" }, { status: 429, headers: { "retry-after": "3600" } });
  }
  const loaded = await load(token);
  if (!loaded)
    return NextResponse.json(
      { error: "Quotation unavailable" },
      { status: 404 },
    );
  const { db, row } = loaded,
    forwarded =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown",
    ipHash = createHash("sha256").update(forwarded).digest("hex");
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(quoteAcceptanceEvents)
    .where(
      and(
        eq(quoteAcceptanceEvents.acceptanceLinkId, row.linkId),
        eq(quoteAcceptanceEvents.eventType, "ACCEPT_ATTEMPT"),
        gt(quoteAcceptanceEvents.createdAt, new Date(Date.now() - 3_600_000)),
        sql`${quoteAcceptanceEvents.evidence}->>'ipHash' = ${ipHash}`,
      ),
    );
  if ((recent?.count ?? 0) >= 10)
    return NextResponse.json(
      { error: "Too many acceptance attempts; try again later" },
      { status: 429 },
    );
  try {
    const accepted = await db.transaction(async (tx) => {
      await tx
        .insert(quoteAcceptanceEvents)
        .values({
          organizationId: row.organizationId,
          acceptanceLinkId: row.linkId,
          eventType: "ACCEPT_ATTEMPT",
          evidence: { ipHash },
        });
      const acceptedAt = new Date(),
        evidence = {
          quoteVersionId: row.quoteVersionId,
          versionNumber: row.versionNumber,
          pdfChecksumSha256: row.pdfChecksumSha256,
          totalMinor: row.totalMinor,
          currency: row.currency,
          legalSnapshot: row.legalSnapshot,
          acceptedName: name,
          acceptedEmail: email,
          acceptedAt: acceptedAt.toISOString(),
          statement: "I accept this quotation and its version-pinned terms.",
        };
      // The quotation itself is the single commercial decision.  Lock this
      // transition so two independently-issued links cannot both accept it.
      const [quoteChanged] = await tx
        .update(quotes)
        .set({ status: "ACCEPTED", updatedAt: acceptedAt })
        .where(and(eq(quotes.id, row.quoteId), eq(quotes.status, "ISSUED")))
        .returning({ id: quotes.id });
      if (!quoteChanged)
        throw new Error("Quotation was already accepted, revoked or changed");
      const [changed] = await tx
        .update(quoteAcceptanceLinks)
        .set({ status: "ACCEPTED", acceptedAt, acceptedName: name, acceptedEmail: email, acceptedIpHash: ipHash, acceptedUserAgent: request.headers.get("user-agent"), evidenceSnapshot: evidence, updatedAt: acceptedAt })
        .where(and(eq(quoteAcceptanceLinks.id, row.linkId), eq(quoteAcceptanceLinks.status, "ACTIVE"), or(isNull(quoteAcceptanceLinks.expiresAt), gt(quoteAcceptanceLinks.expiresAt, acceptedAt))))
        .returning({ id: quoteAcceptanceLinks.id });
      if (!changed) throw new Error("Quotation link was already used, revoked or expired");
      await tx
        .update(quoteAcceptanceLinks)
        .set({ status: "REVOKED", revokedAt: acceptedAt, updatedAt: acceptedAt })
        .where(and(eq(quoteAcceptanceLinks.quoteVersionId, row.quoteVersionId), eq(quoteAcceptanceLinks.status, "ACTIVE")));
      await tx
        .insert(quoteAcceptanceEvents)
        .values({
          organizationId: row.organizationId,
          acceptanceLinkId: row.linkId,
          eventType: "ACCEPTED",
          evidence,
        });
      return evidence;
    });
    return NextResponse.json({
      accepted: true,
      acceptedAt: accepted.acceptedAt,
      versionNumber: row.versionNumber,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to accept quotation",
      },
      { status: 409 },
    );
  }
}
