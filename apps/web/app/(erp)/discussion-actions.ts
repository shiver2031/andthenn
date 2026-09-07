"use server";
import { inlineMentionIds } from "../../lib/inline-mentions";
import { and, auditEvents, createDatabase, deliverables, eq, fileAssets, fileVersions, internalComments, internalCommentMentions, memberships, profiles, notifications, projects, tasks } from "@andthenn/db";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../lib/actor-context";
import { demoModeEnabled } from "../../lib/config";
import { isResourceId } from "../../lib/resource-access";
import { discussionMemberScope } from "../../lib/discussion-scope";
export async function postDiscussion(form: FormData) {
  const actor = await resolveActorContext();
  if (!actor || actor.role === "CLIENT" || demoModeEnabled()) throw new Error("Internal discussion access required.");
  const taskId = String(form.get("taskId") ?? ""), projectInput = String(form.get("projectId") ?? ""), body = String(form.get("body") ?? "").trim(), parent = String(form.get("parentCommentId") ?? ""), fileVersionId = String(form.get("fileVersionId") ?? ""), requestId = String(form.get("requestId") ?? "");
  if (!body || body.length > 10000 || !isResourceId(requestId) || Boolean(taskId) === Boolean(projectInput) || !isResourceId(taskId || projectInput)) throw new Error("Choose a discussion and write a comment (up to 10,000 characters).");
  const selectedRecipients = [...new Set(form.getAll("mentionMembershipId").map(String))];
  const { db } = createDatabase();
  const projectId = await db.transaction(async (tx) => {
    const [lineage] = taskId ? await tx.select({ id: deliverables.projectId }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1) : [{ id: projectInput }];
    if (!lineage) throw new Error("Discussion unavailable.");
    const [project] = await tx.select().from(projects).where(and(eq(projects.id, lineage.id), eq(projects.organizationId, actor.organizationId))).limit(1).for("update");
    if (!project) throw new Error("Discussion unavailable.");
    const members = await tx.select({ id: memberships.id, name: profiles.displayName, role: memberships.role, sessionRevokedAfter: memberships.sessionRevokedAfter }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(discussionMemberScope(actor.organizationId, project.id, taskId || undefined)).for("share");
    const recipients = [...new Set([...selectedRecipients, ...inlineMentionIds(body, members)])];
    const currentActor = members.find((member) => member.id === actor.membershipId);
    if (!currentActor || currentActor.role !== actor.role || (currentActor.sessionRevokedAfter && (!actor.sessionIssuedAt || actor.sessionIssuedAt <= currentActor.sessionRevokedAfter))) throw new Error("Your access changed. Sign in again.");
    if (!members.some((member) => member.id === actor.membershipId) || recipients.some((id) => !members.some((member) => member.id === id))) throw new Error("Choose active internal teammates who can access this discussion.");
    const [existing] = await tx.select().from(internalComments).where(and(eq(internalComments.requestId, requestId), eq(internalComments.authorMembershipId, actor.membershipId))).limit(1);
    if (existing) return project.id;
    if (parent) {
      if (!isResourceId(parent)) throw new Error("Reply unavailable.");
      const [target] = await tx.select().from(internalComments).where(and(eq(internalComments.id, parent), eq(internalComments.organizationId, actor.organizationId), taskId ? eq(internalComments.taskId, taskId) : eq(internalComments.projectId, project.id))).limit(1);
      if (!target) throw new Error("Reply must belong to this discussion.");
    }
    if (fileVersionId) {
      if (!taskId || !isResourceId(fileVersionId)) throw new Error("Version feedback requires a task version.");
      const [version] = await tx.select({ id: fileVersions.id }).from(fileVersions).innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId)).where(and(eq(fileVersions.id, fileVersionId), eq(fileAssets.taskId, taskId), eq(fileVersions.organizationId, actor.organizationId))).limit(1);
      if (!version) throw new Error("Version does not belong to this task.");
    }
    const [comment] = await tx.insert(internalComments).values({ organizationId: actor.organizationId, authorMembershipId: actor.membershipId, taskId: taskId || null, projectId: taskId ? null : project.id, body, parentCommentId: parent || null, fileVersionId: fileVersionId || null, requestId }).returning();
    if (recipients.length) await tx.insert(internalCommentMentions).values(recipients.map((mentionedMembershipId) => ({ organizationId: actor.organizationId, commentId: comment!.id, mentionedMembershipId })));
    const notify = recipients.filter((id) => id !== actor.membershipId);
    if (notify.length) await tx.insert(notifications).values(notify.map((recipientMembershipId) => ({ organizationId: actor.organizationId, recipientMembershipId, eventType: "discussion.mentioned", title: `${actor.displayName} mentioned you`, body: body.slice(0,240), objectType: "INTERNAL_COMMENT", objectId: comment!.id })));
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: actor.displayName, action: "discussion.commented", objectType: "INTERNAL_COMMENT", objectId: comment!.id, source: "SERVER_ACTION", after: { projectId: project.id, taskId: taskId || null, fileVersionId: fileVersionId || null, recipients, parent }, correlationId: requestId });
    return project.id;
  });
  for (const path of [`/projects/${projectId}`, ...(taskId ? [`/tasks/${taskId}`] : []), "/notifications", "/home", "/work"]) revalidatePath(path);
}
