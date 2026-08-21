import {
  and,
  createDatabase,
  eq,
  fileVersions,
  gt,
  isNull,
  or,
  reviewShares,
} from "@andthenn/db";
import { NextResponse } from "next/server";
import { assertRuntimeConfiguration } from "../../../../../lib/config";
import { hashReviewToken } from "../../../../../lib/security";
import { createStorage } from "../../../../../lib/storage";

const availableShare = (token: string) =>
  and(
    eq(reviewShares.tokenHash, hashReviewToken(token)),
    eq(reviewShares.status, "ACTIVE"),
    or(isNull(reviewShares.expiresAt), gt(reviewShares.expiresAt, new Date())),
  );

function contentDisposition(filename: string, download: boolean) {
  return `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertRuntimeConfiguration();
    const { token } = await params;
    const { db } = createDatabase();
    const [share] = await db
      .select({
        storageKey: fileVersions.storageKey,
        filename: fileVersions.filename,
        contentType: fileVersions.detectedContentType,
        declaredContentType: fileVersions.contentType,
        downloadAllowed: reviewShares.downloadAllowed,
      })
      .from(reviewShares)
      .innerJoin(fileVersions, eq(fileVersions.id, reviewShares.fileVersionId))
      .where(availableShare(token))
      .limit(1);
    if (!share) return NextResponse.json({ error: "Share unavailable" }, { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1" && share.downloadAllowed;
    const object = await createStorage().openRead(share.storageKey, request.headers.get("range") ?? undefined);
    return new NextResponse(object.body, {
      status: object.contentRange ? 206 : 200,
      headers: {
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
        "content-disposition": contentDisposition(share.filename, download),
        "content-length": String(object.contentLength),
        "content-type": share.contentType ?? share.declaredContentType,
        ...(object.contentRange ? { "content-range": object.contentRange } : {}),
        ...(object.etag ? { etag: `"${object.etag}"` } : {}),
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  }
}
