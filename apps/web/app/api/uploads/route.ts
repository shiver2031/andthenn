import { uploadInitiateSchema } from "@andthenn/contracts";
import { and, createDatabase, eq, fileAssets, isNull, taskAssignees, tasks, uploadSessions } from "@andthenn/db";
import { can } from "@andthenn/domain";
import { NextResponse } from "next/server";
import { resolveActorContext } from "../../../lib/actor-context";
import { createStorage } from "../../../lib/storage";
import { demoModeEnabled } from "../../../lib/config";

export async function POST(request: Request) {
  if (demoModeEnabled()) return NextResponse.json({ error: "Demo mode is read-only" }, { status: 403 });
  const actor = await resolveActorContext();
  if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = uploadInitiateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload", issues: parsed.error.issues }, { status: 400 });
  const { db } = createDatabase();
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.organizationId, actor.organizationId))).limit(1);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const [assignment] = await db.select({ membershipId: taskAssignees.membershipId, kind: taskAssignees.kind }).from(taskAssignees).where(and(eq(taskAssignees.taskId, parsed.data.taskId), eq(taskAssignees.membershipId, actor.membershipId), eq(taskAssignees.organizationId, actor.organizationId), isNull(taskAssignees.removedAt))).limit(1);
  if (!can(actor, "tasks:contribute", { taskId: task.id, isPrimaryOwner: assignment?.kind === "PRIMARY", isCollaborator: assignment?.kind === "COLLABORATOR" })) return NextResponse.json({ error: "Task contribution permission required" }, { status: 403 });
  if (parsed.data.fileAssetId) {
    const [asset] = await db.select({ id: fileAssets.id }).from(fileAssets).where(and(eq(fileAssets.id, parsed.data.fileAssetId), eq(fileAssets.taskId, task.id), eq(fileAssets.organizationId, actor.organizationId))).limit(1);
    if (!asset) return NextResponse.json({ error: "File asset not found for task" }, { status: 404 });
  }
  const sessionId = crypto.randomUUID();
  const signed = await createStorage().initiateUpload({ organizationId: actor.organizationId, taskId: parsed.data.taskId, fileVersionId: sessionId, filename: parsed.data.filename, contentType: parsed.data.contentType, sizeBytes: parsed.data.sizeBytes, checksumSha256: parsed.data.checksumSha256 });
  await db.insert(uploadSessions).values({ id: sessionId, organizationId: actor.organizationId, taskId: parsed.data.taskId, fileAssetId: parsed.data.fileAssetId, logicalName: parsed.data.logicalName, filename: parsed.data.filename, contentType: parsed.data.contentType, sizeBytes: parsed.data.sizeBytes, checksumSha256: parsed.data.checksumSha256, providerUploadId: signed.uploadId, uploadMode: signed.mode, expectedPartCount: signed.parts?.length ?? 1, uploaderMembershipId: actor.membershipId, expiresAt: signed.expiresAt });
  return NextResponse.json({ uploadId: sessionId, mode: signed.mode, uploadUrl: signed.uploadUrl, parts: signed.parts, expiresAt: signed.expiresAt }, { status: 201 });
}
