import { isCurrentFinalFile } from "../../../../lib/final-file";
import { and, createDatabase, deliverables, eq, fileAssets, fileVersions, gt, isNull, or, projects, reviewHubs, reviewShares, tasks } from "@andthenn/db";
import { NextResponse } from "next/server";
import { resolveActorContext } from "../../../../lib/actor-context";
import { canReadFile, canReadProject, isResourceId } from "../../../../lib/resource-access";
import { createStorage } from "../../../../lib/storage";

/** Authenticated reads re-check current grants; no durable signed URL bypasses revocation. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveActorContext();
  if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  if (!isResourceId(id)) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  const { db } = createDatabase();
  const [file] = await db.select({ id: projects.id, clientId: projects.clientId, taskId: tasks.id, lockedAt: fileVersions.lockedAt, isCurrentFinal: isCurrentFinalFile, storageKey: fileVersions.storageKey, filename: fileVersions.filename, contentType: fileVersions.contentType, detectedContentType: fileVersions.detectedContentType }).from(fileVersions).innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId)).innerJoin(tasks, eq(tasks.id, fileAssets.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(and(eq(fileVersions.id, id), eq(fileVersions.organizationId, actor.organizationId), eq(fileVersions.processingStatus, "READY"))).limit(1);
  if (!file) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  const query = new URL(request.url).searchParams;
  let allowed = canReadFile(actor, { ...file, taskIds: [file.taskId] });
  const shareId = query.get("reviewShareId");
  if (!allowed && actor.role === "CLIENT" && shareId && isResourceId(shareId) && query.get("preview") === "1" && canReadProject(actor, file)) {
    const [share] = await db.select({ id: reviewShares.id }).from(reviewShares).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).where(and(eq(reviewShares.id, shareId), eq(reviewShares.organizationId, actor.organizationId), eq(reviewShares.fileVersionId, id), eq(reviewHubs.taskId, file.taskId), eq(reviewShares.status, "ACTIVE"), or(isNull(reviewShares.expiresAt), gt(reviewShares.expiresAt, new Date())))).limit(1);
    allowed = Boolean(share);
  }
  if (!allowed) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  try {
    const object = await createStorage().openRead(file.storageKey, request.headers.get("range") ?? undefined);
    return new NextResponse(object.body, { status: object.contentRange ? 206 : 200, headers: {
      "cache-control": "private, no-store", "accept-ranges": "bytes", "content-type": file.detectedContentType ?? file.contentType,
      "content-length": String(object.contentLength), "content-disposition": `${query.get("preview") === "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
      ...(object.contentRange ? { "content-range": object.contentRange } : {}),
    } });
  } catch { return NextResponse.json({ error: "File unavailable; retry shortly" }, { status: 404 }); }
}
