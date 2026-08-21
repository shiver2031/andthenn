import { uploadCompleteSchema } from "@andthenn/contracts";
import {
  and,
  createDatabase,
  eq,
  fileAssets,
  fileVersions,
  outboxEvents,
  sql,
  uploadSessions,
} from "@andthenn/db";
import { NextResponse } from "next/server";
import { resolveActorContext } from "../../../../lib/actor-context";
import { createStorage } from "../../../../lib/storage";
import { demoModeEnabled } from "../../../../lib/config";

export async function POST(request: Request) {
  if (demoModeEnabled())
    return NextResponse.json(
      { error: "Demo mode is read-only" },
      { status: 403 },
    );
  const actor = await resolveActorContext();
  if (!actor)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const parsed = uploadCompleteSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid completion", issues: parsed.error.issues },
      { status: 400 },
    );
  const { db } = createDatabase();
  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(
      and(
        eq(uploadSessions.id, parsed.data.uploadId),
        eq(uploadSessions.organizationId, actor.organizationId),
        eq(uploadSessions.uploaderMembershipId, actor.membershipId),
      ),
    )
    .limit(1);
  if (!session)
    return NextResponse.json(
      { error: "Upload session unavailable" },
      { status: 409 },
    );
  if (session.status === "COMPLETED") {
    const [version] = await db
      .select({
        id: fileVersions.id,
        versionNumber: fileVersions.versionNumber,
        processingStatus: fileVersions.processingStatus,
      })
      .from(fileVersions)
      .where(eq(fileVersions.id, session.id))
      .limit(1);
    return version
      ? NextResponse.json(version)
      : NextResponse.json(
          { error: "Completed upload is missing its version" },
          { status: 500 },
        );
  }
  if (
    !["INITIATED", "FINALIZING", "PROVIDER_FINALIZED"].includes(session.status) ||
    (session.status === "INITIATED" && session.expiresAt < new Date())
  )
    return NextResponse.json(
      { error: "Upload session unavailable" },
      { status: 409 },
    );
  if (parsed.data.fileVersionId !== session.id)
    return NextResponse.json(
      { error: "File-version identity mismatch" },
      { status: 409 },
    );
  if (
    session.checksumSha256 !== parsed.data.checksumSha256 ||
    session.sizeBytes !== parsed.data.sizeBytes
  )
    return NextResponse.json(
      { error: "Upload metadata mismatch" },
      { status: 409 },
    );
  if (
    session.uploadMode === "MULTIPART" &&
    parsed.data.parts?.length !== session.expectedPartCount
  )
    return NextResponse.json(
      { error: "Multipart completion is missing parts" },
      { status: 409 },
    );
  if (session.uploadMode === "SINGLE" && parsed.data.parts?.length)
    return NextResponse.json(
      { error: "Single upload cannot include multipart parts" },
      { status: 409 },
    );
  let finalized: { objectKey: string; etag: string };
  if (session.status === "PROVIDER_FINALIZED") {
    if (!session.providerObjectKey || !session.providerEtag)
      return NextResponse.json(
        { error: "Finalized upload is missing provider evidence" },
        { status: 500 },
      );
    finalized = {
      objectKey: session.providerObjectKey,
      etag: session.providerEtag,
    };
  } else {
    const staleFinalization =
      session.status === "FINALIZING" &&
      (!session.finalizingAt || session.finalizingAt < new Date(Date.now() - 60_000));
    if (session.status === "FINALIZING" && !staleFinalization) {
      return NextResponse.json(
        { error: "Upload completion is already in progress; retry shortly" },
        { status: 409, headers: { "retry-after": "5" } },
      );
    }
    const [claimed] = await db
      .update(uploadSessions)
      .set({ status: "FINALIZING", finalizingAt: new Date() })
      .where(
        and(
          eq(uploadSessions.id, session.id),
          session.status === "INITIATED"
            ? eq(uploadSessions.status, "INITIATED")
            : eq(uploadSessions.status, "FINALIZING"),
        ),
      )
      .returning({ id: uploadSessions.id });
    if (!claimed)
      return NextResponse.json(
        { error: "Upload completion is already in progress" },
        { status: 409 },
      );
    try {
      finalized = await createStorage().finalizeUpload({
        organizationId: session.organizationId,
        taskId: session.taskId,
        fileVersionId: session.id,
        filename: session.filename,
        contentType: session.contentType,
        sizeBytes: session.sizeBytes,
        checksumSha256: session.checksumSha256,
        uploadId: session.providerUploadId,
        ...(parsed.data.parts ? { parts: parsed.data.parts } : {}),
      });
      await db
        .update(uploadSessions)
        .set({
          status: "PROVIDER_FINALIZED",
          finalizingAt: null,
          providerObjectKey: finalized.objectKey,
          providerEtag: finalized.etag,
        })
        .where(
          and(
            eq(uploadSessions.id, session.id),
            eq(uploadSessions.status, "FINALIZING"),
          ),
        );
    } catch (error) {
      await db
        .update(uploadSessions)
        .set({ status: "INITIATED" })
        .where(
          and(
            eq(uploadSessions.id, session.id),
            eq(uploadSessions.status, "FINALIZING"),
          ),
        );
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to finalize upload",
        },
        { status: 409 },
      );
    }
  }
  try {
    const created = await db.transaction(async (tx) => {
      let fileAssetId = session.fileAssetId;
      if (!fileAssetId) {
        const [asset] = await tx
          .insert(fileAssets)
          .values({
            organizationId: session.organizationId,
            taskId: session.taskId,
            logicalName: session.logicalName,
          })
          .returning({ id: fileAssets.id });
        fileAssetId = asset!.id;
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${fileAssetId}, 0))`,
      );
      const existing = await tx
        .select({ version: fileVersions.versionNumber })
        .from(fileVersions)
        .where(eq(fileVersions.fileAssetId, fileAssetId));
      const versionNumber =
        Math.max(0, ...existing.map((item) => item.version)) + 1;
      const [version] = await tx
        .insert(fileVersions)
        .values({
          id: parsed.data.fileVersionId,
          organizationId: session.organizationId,
          fileAssetId,
          versionNumber,
          filename: session.filename,
          contentType: session.contentType,
          sizeBytes: session.sizeBytes,
          checksumSha256: session.checksumSha256,
          storageProvider: "SUPABASE_S3",
          storageKey: finalized.objectKey,
          uploaderMembershipId: session.uploaderMembershipId,
        })
        .returning({
          id: fileVersions.id,
          versionNumber: fileVersions.versionNumber,
        });
      await tx
        .update(uploadSessions)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(eq(uploadSessions.id, session.id));
      await tx
        .insert(outboxEvents)
        .values({
          organizationId: session.organizationId,
          eventType: "media.process",
          aggregateType: "FILE_VERSION",
          aggregateId: version!.id,
          payload: { fileVersionId: version!.id },
          idempotencyKey: `media.process:${version!.id}`,
          correlationId: crypto.randomUUID(),
        })
        .onConflictDoNothing();
      return version;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.message}. Provider upload is preserved; retry completion.`
            : "Database completion failed; retry safely",
      },
      { status: 409 },
    );
  }
}
