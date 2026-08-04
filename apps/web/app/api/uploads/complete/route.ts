import { uploadCompleteSchema } from "@andthenn/contracts";
import { createDatabase, eq, fileAssets, fileVersions, uploadSessions } from "@andthenn/db";
import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/supabase/server";
import { createStorage } from "../../../../lib/storage";

export async function POST(request: Request) {
  await requireUser();
  const parsed = uploadCompleteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid completion", issues: parsed.error.issues }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ fileVersionId: parsed.data.fileVersionId, demo: true }, { status: 201 });
  const { db } = createDatabase();
  const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, parsed.data.uploadId)).limit(1);
  if (!session || session.status !== "INITIATED" || session.expiresAt < new Date()) return NextResponse.json({ error: "Upload session unavailable" }, { status: 409 });
  if (parsed.data.fileVersionId !== session.id) return NextResponse.json({ error: "File-version identity mismatch" }, { status: 409 });
  if (session.checksumSha256 !== parsed.data.checksumSha256 || session.sizeBytes !== parsed.data.sizeBytes) return NextResponse.json({ error: "Upload metadata mismatch" }, { status: 409 });
  const finalized = await createStorage().finalizeUpload({ organizationId: session.organizationId, taskId: session.taskId, fileVersionId: session.id, filename: session.filename, contentType: session.contentType, sizeBytes: session.sizeBytes, checksumSha256: session.checksumSha256, uploadId: session.providerUploadId });
  const created = await db.transaction(async (tx) => {
    let fileAssetId = session.fileAssetId;
    if (!fileAssetId) { const [asset] = await tx.insert(fileAssets).values({ organizationId: session.organizationId, taskId: session.taskId, logicalName: session.logicalName }).returning({ id: fileAssets.id }); fileAssetId = asset!.id; }
    const existing = await tx.select({ version: fileVersions.versionNumber }).from(fileVersions).where(eq(fileVersions.fileAssetId, fileAssetId));
    const versionNumber = Math.max(0, ...existing.map((item) => item.version)) + 1;
    const [version] = await tx.insert(fileVersions).values({ id: parsed.data.fileVersionId, organizationId: session.organizationId, fileAssetId, versionNumber, filename: session.filename, contentType: session.contentType, sizeBytes: session.sizeBytes, checksumSha256: session.checksumSha256, storageProvider: "SUPABASE_S3", storageKey: finalized.objectKey, uploaderMembershipId: session.uploaderMembershipId }).returning({ id: fileVersions.id, versionNumber: fileVersions.versionNumber });
    await tx.update(uploadSessions).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(uploadSessions.id, session.id));
    return version;
  });
  return NextResponse.json(created, { status: 201 });
}
