import { NextResponse } from "next/server";
import {
  and, createDatabase, deliverables, eq, fileApprovals, finalDeliveries, inArray,
  intakeItems, isNull, membershipWalkthroughs, projects, reviewComments, reviewHubs,
  reviewShares, taskReviewSelections, tasks,
} from "@andthenn/db";
import { isOperationalLeader } from "@andthenn/domain";
import { resolveActorContext, type ActorContext } from "../../../lib/actor-context";
import { canReadProject, canReadTask } from "../../../lib/resource-access";
import { walkthroughSteps, type WalkthroughTargets } from "../../../lib/walkthrough-flow";

export const dynamic = "force-dynamic";

async function destinations(actor: ActorContext): Promise<WalkthroughTargets> {
  const { db } = createDatabase();
  const leader = isOperationalLeader(actor.role);
  const assignedIds = [...new Set([...actor.primaryTaskIds, ...actor.collaboratorTaskIds, ...actor.assignedByMeTaskIds])];
  const taskRows = actor.role === "CLIENT" || (!leader && !assignedIds.length)
    ? []
    : await db.select({ id: tasks.id, projectId: projects.id, clientId: projects.clientId, status: tasks.executionStatus })
      .from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId))
      .where(and(eq(tasks.organizationId, actor.organizationId), ...(!leader ? [inArray(tasks.id, assignedIds)] : [])));
  const visibleTasks = taskRows.filter((row) => canReadTask(actor, { id: row.projectId, clientId: row.clientId, taskId: row.id, taskIds: [row.id] }));
  const permittedProjectIds = [...new Set([...actor.visibleProjectIds, ...visibleTasks.map((row) => row.projectId)])];
  const projectRows = !leader && !permittedProjectIds.length ? [] : await db.select({ id: projects.id, clientId: projects.clientId, status: projects.status })
    .from(projects).where(and(eq(projects.organizationId, actor.organizationId), ...(!leader ? [inArray(projects.id, permittedProjectIds)] : [])));
  const visibleProjects = projectRows.filter((row) => canReadProject(actor, { ...row, taskIds: visibleTasks.filter((task) => task.projectId === row.id).map((task) => task.id) }));
  const projectIds = visibleProjects.map((row) => row.id);
  const taskIds = visibleTasks.map((row) => row.id);
  const [briefRows, outputRows, selectionRows, shareRows, approvalRows, finalRows] = await Promise.all([
    leader ? db.select({ id: intakeItems.id }).from(intakeItems).where(and(eq(intakeItems.organizationId, actor.organizationId), inArray(intakeItems.status, ["UNASSIGNED", "CLAIMED", "NEEDS_MANAGER_INPUT", "READY_FOR_DECISION"]))).limit(1) : Promise.resolve([]),
    actor.role !== "CLIENT" && projectIds.length ? db.select({ projectId: deliverables.projectId }).from(deliverables).where(and(eq(deliverables.organizationId, actor.organizationId), inArray(deliverables.projectId, projectIds), inArray(deliverables.status, ["OPEN", "REOPENED"]))).limit(20) : Promise.resolve([]),
    taskIds.length ? db.select({ taskId: taskReviewSelections.taskId }).from(taskReviewSelections).where(and(eq(taskReviewSelections.organizationId, actor.organizationId), inArray(taskReviewSelections.taskId, taskIds))).limit(20) : Promise.resolve([]),
    projectIds.length ? db.select({ id: reviewShares.id, taskId: reviewHubs.taskId, projectId: deliverables.projectId, status: reviewShares.status, taskStatus: tasks.executionStatus, expiresAt: reviewShares.expiresAt }).from(reviewShares).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).innerJoin(tasks, eq(tasks.id, reviewHubs.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).where(and(eq(reviewShares.organizationId, actor.organizationId), inArray(deliverables.projectId, projectIds))).limit(100) : Promise.resolve([]),
    projectIds.length ? db.select({ taskId: fileApprovals.taskId, projectId: deliverables.projectId }).from(fileApprovals).innerJoin(tasks, eq(tasks.id, fileApprovals.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).where(and(eq(fileApprovals.organizationId, actor.organizationId), eq(fileApprovals.approvalKind, "CLIENT"), isNull(fileApprovals.reopenedAt), inArray(deliverables.projectId, projectIds))).limit(20) : Promise.resolve([]),
    projectIds.length ? db.select({ taskId: finalDeliveries.taskId, projectId: deliverables.projectId }).from(finalDeliveries).innerJoin(tasks, eq(tasks.id, finalDeliveries.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).where(and(eq(finalDeliveries.organizationId, actor.organizationId), isNull(finalDeliveries.withdrawnAt), inArray(deliverables.projectId, projectIds))).limit(20) : Promise.resolve([]),
  ]);
  const activeShares = shareRows.filter((row) => row.status === "ACTIVE" && (!row.expiresAt || row.expiresAt > new Date()) && (actor.role === "CLIENT" ? row.taskStatus !== "COMPLETED" : taskIds.includes(row.taskId)));
  const shareIds = activeShares.map((row) => row.id);
  const feedbackRows = shareIds.length ? await db.select({ reviewShareId: reviewComments.reviewShareId }).from(reviewComments).where(and(eq(reviewComments.organizationId, actor.organizationId), inArray(reviewComments.reviewShareId, shareIds), isNull(reviewComments.resolvedAt))).limit(20) : [];
  const feedbackShare = activeShares.find((share) => feedbackRows.some((row) => row.reviewShareId === share.id));
  const approvedShare = activeShares.find((share) => approvalRows.some((row) => row.taskId === share.taskId));
  const task = visibleTasks[0];
  const project = visibleProjects.find((item) => item.id === task?.projectId) ?? visibleProjects[0];
  const assignment = outputRows.find((row) => visibleProjects.some((item) => item.id === row.projectId && (item.status === "ACTIVE" || item.status === "REOPENED")));
  const internalReview = selectionRows.find((row) => taskIds.includes(row.taskId));
  const final = finalRows.find((row) => actor.role === "CLIENT" || taskIds.includes(row.taskId));
  const completed = visibleProjects.find((row) => row.status === "COMPLETED");
  return {
    brief: briefRows[0] ? `/intake?view=queue&item=${briefRows[0].id}` : null,
    project: project ? `/projects/${project.id}#overview` : null,
    task: task ? `/tasks/${task.id}` : null,
    assignment: assignment ? `/work?new=task&project=${assignment.projectId}` : null,
    internalReview: internalReview ? `/tasks/${internalReview.taskId}` : null,
    clientReview: activeShares[0] ? `/projects/${activeShares[0].projectId}#${actor.role === "CLIENT" ? "client-decisions" : "review"}` : null,
    feedback: feedbackShare ? actor.role === "CLIENT" ? `/projects/${feedbackShare.projectId}#client-decisions` : `/tasks/${feedbackShare.taskId}` : null,
    approval: approvedShare ? actor.role === "CLIENT" ? `/projects/${approvedShare.projectId}#client-decisions` : leader ? `/tasks/${approvedShare.taskId}` : `/projects/${approvedShare.projectId}#review` : null,
    finalDelivery: final ? `/projects/${final.projectId}#files` : null,
    completed: completed ? `/projects/${completed.id}#overview` : null,
  };
}

export async function GET() {
  const actor = await resolveActorContext();
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { db } = createDatabase();
  const [state] = await db.select().from(membershipWalkthroughs).where(and(eq(membershipWalkthroughs.membershipId, actor.membershipId), eq(membershipWalkthroughs.organizationId, actor.organizationId))).limit(1);
  const targets = await destinations(actor);
  const keys = walkthroughSteps(actor.role, actor.financeAccess, targets).map((step) => step.key);
  return NextResponse.json({ optedOut: Boolean(state?.optedOutAt), resumeStepKey: state?.resumeRole === actor.role && state.resumeStepKey && keys.includes(state.resumeStepKey) ? state.resumeStepKey : null, targets }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const actor = await resolveActorContext();
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { command?: string; stepKey?: string } | null;
  if (!body || !["optOut", "pause", "complete"].includes(body.command ?? "")) return NextResponse.json({ error: "Invalid walkthrough command" }, { status: 400 });
  if (body.command === "pause" && (!body.stepKey || !walkthroughSteps(actor.role, actor.financeAccess, {} as WalkthroughTargets).some((step) => step.key === body.stepKey))) return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  const { db } = createDatabase();
  const now = new Date();
  await db.insert(membershipWalkthroughs).values({ membershipId: actor.membershipId, organizationId: actor.organizationId, optedOutAt: body.command === "optOut" ? now : null, resumeStepKey: body.command === "pause" ? body.stepKey! : null, resumeRole: body.command === "pause" ? actor.role : null, updatedAt: now }).onConflictDoUpdate({ target: membershipWalkthroughs.membershipId, set: { ...(body.command === "optOut" ? { optedOutAt: now, resumeStepKey: null, resumeRole: null } : body.command === "pause" ? { resumeStepKey: body.stepKey!, resumeRole: actor.role } : { resumeStepKey: null, resumeRole: null }), updatedAt: now } });
  return NextResponse.json({ ok: true });
}
