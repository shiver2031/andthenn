import { uploadInitiateSchema } from "@andthenn/contracts";
import { and, createDatabase, eq, memberships, profiles, taskAssignees, uploadSessions } from "@andthenn/db";
import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/supabase/server";
import { createStorage } from "../../../lib/storage";

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = uploadInitiateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload", issues: parsed.error.issues }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ uploadId: "demo", uploadUrl: "/api/uploads/demo", expiresAt: new Date(Date.now()+900_000), demo: true }, { status: 201 });
  const { db } = createDatabase();
  const [member] = await db.select({ id: memberships.id, organizationId: memberships.organizationId, role: memberships.role, accountType: memberships.accountType }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(profiles.authUserId, user.id), eq(memberships.status, "ACTIVE"))).limit(1);
  if (!member) return NextResponse.json({ error: "No active membership" }, { status: 403 });
  if (member.accountType === "TEMPORARY") {
    const [assignment] = await db.select({ membershipId: taskAssignees.membershipId }).from(taskAssignees).where(and(eq(taskAssignees.taskId, parsed.data.taskId), eq(taskAssignees.membershipId, member.id))).limit(1);
    if (!assignment) return NextResponse.json({ error: "Task assignment required" }, { status: 403 });
  }
  const sessionId = crypto.randomUUID();
  const signed = await createStorage().initiateUpload({ organizationId: member.organizationId, taskId: parsed.data.taskId, fileVersionId: sessionId, filename: parsed.data.filename, contentType: parsed.data.contentType, sizeBytes: parsed.data.sizeBytes, checksumSha256: parsed.data.checksumSha256 });
  await db.insert(uploadSessions).values({ id: sessionId, organizationId: member.organizationId, taskId: parsed.data.taskId, fileAssetId: parsed.data.fileAssetId, logicalName: parsed.data.logicalName, filename: parsed.data.filename, contentType: parsed.data.contentType, sizeBytes: parsed.data.sizeBytes, checksumSha256: parsed.data.checksumSha256, providerUploadId: signed.uploadId, uploaderMembershipId: member.id, expiresAt: signed.expiresAt });
  return NextResponse.json({ uploadId: sessionId, uploadUrl: signed.uploadUrl, expiresAt: signed.expiresAt }, { status: 201 });
}
