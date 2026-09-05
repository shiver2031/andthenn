import { Badge, Button } from "@andthenn/ui";
import Link from "next/link";
import { ChevronRight, Clock3 } from "lucide-react";
import {
  and,
  assetRights,
  clients,
  createDatabase,
  deliverables,
  eq,
  fileApprovals,
  fileAssets,
  fileVersions,
  inArray,
  internalCommentMentions,
  internalComments,
  isNull,
  memberships,
  profiles,
  projects,
  reviewComments,
  reviewerSessions,
  reviewHubs,
  reviewShares,
  reviewViewEvents,
  taskAssignees,
  taskReviewSelections,
  tasks,
  timeEntries,
  workflowStages,
  workflows,
} from "@andthenn/db";
import { notFound } from "next/navigation";
import { TaskPhaseForm } from "../../../../components/task-phase-form";
import { logTime } from "../../actions";
import { TaskExecutionControls } from "../../../../components/task-execution-controls";
import { resolveActorContext } from "../../../../lib/actor-context";
import { TaskReviewHub } from "../../../../components/task-review-hub";
import { taskMentionScope } from "../../../../lib/task-mention-scope";
import { isOperationalLeader } from "@andthenn/domain";
import { TaskDiscussion } from "../../../../components/task-discussion";
import { canReadTask, isResourceId } from "../../../../lib/resource-access";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isResourceId(id)) notFound();
  const actor = await resolveActorContext();
  if (!actor) return null;
  const { db } = createDatabase();
  const [task] = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      description: tasks.description,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      estimatedMinutes: tasks.estimatedMinutes,
      version: tasks.version,
      stageId: tasks.currentWorkflowStageId,
      stateKind: tasks.stateKind,
      executionStatus: tasks.executionStatus,
      completionRequestedAt: tasks.completionRequestedAt,
      completionReviewerMembershipId: tasks.completionReviewerMembershipId,
      deliverableId: tasks.deliverableId,
      deliverable: deliverables.name,
      projectId: projects.id,
      clientId: projects.clientId,
      client: clients.name,
      project: projects.name,
      projectOwnerId: projects.ownerMembershipId,
    })
    .from(tasks)
    .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
    .innerJoin(projects, eq(projects.id, deliverables.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(
      and(eq(tasks.id, id), eq(tasks.organizationId, actor.organizationId)),
    )
    .limit(1);
  if (!task || !canReadTask(actor, { id: task.projectId, clientId: task.clientId, taskId: id, taskIds: [id] })) notFound();
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.projectId, task.projectId),
        eq(workflows.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  const [assignments, entries, stages] = await Promise.all([
    db
      .select({ membershipId: taskAssignees.membershipId, kind: taskAssignees.kind, assignedAt: taskAssignees.assignedAt, assignedByMembershipId: taskAssignees.assignedByMembershipId, name: profiles.displayName })
      .from(taskAssignees)
      .innerJoin(memberships, eq(memberships.id, taskAssignees.membershipId))
      .innerJoin(profiles, eq(profiles.id, memberships.profileId))
      .where(
        and(
          eq(taskAssignees.taskId, id),
          eq(taskAssignees.organizationId, actor.organizationId),
          isNull(taskAssignees.removedAt),
        ),
      ),
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.taskId, id),
          eq(timeEntries.organizationId, actor.organizationId),
        ),
      ),
    workflow
      ? db
          .select()
          .from(workflowStages)
          .where(eq(workflowStages.workflowId, workflow.id))
      : Promise.resolve([]),
  ]);
  const loggedMinutes = entries.reduce(
    (total, entry) => total + entry.minutes,
    0,
  );
  const [
    assetRows,
    versionRows,
    shareRows,
    viewRows,
    commentRows,
    rightRows,
    approvalRows,
  ] = await Promise.all([
    db
      .select()
      .from(fileAssets)
      .where(
        and(
          eq(fileAssets.taskId, id),
          eq(fileAssets.organizationId, actor.organizationId),
        ),
      ),
    db
      .select({
        id: fileVersions.id,
        fileAssetId: fileVersions.fileAssetId,
        versionNumber: fileVersions.versionNumber,
        filename: fileVersions.filename,
        contentType: fileVersions.contentType,
        sizeBytes: fileVersions.sizeBytes,
        processingStatus: fileVersions.processingStatus,
        lockedAt: fileVersions.lockedAt,
      })
      .from(fileVersions)
      .innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId))
      .where(
        and(
          eq(fileAssets.taskId, id),
          eq(fileVersions.organizationId, actor.organizationId),
        ),
      )
      .orderBy(fileVersions.versionNumber),
    db
      .select({
        id: reviewShares.id,
        fileVersionId: reviewShares.fileVersionId,
        status: reviewShares.status,
        expiresAt: reviewShares.expiresAt,
        recipient: reviewShares.recipientSnapshot,
      })
      .from(reviewShares)
      .innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId))
      .where(
        and(
          eq(reviewHubs.taskId, id),
          eq(reviewShares.organizationId, actor.organizationId),
        ),
      )
      .orderBy(reviewShares.createdAt),
    db
      .select({
        shareId: reviewViewEvents.reviewShareId,
        viewedAt: reviewViewEvents.viewedAt,
      })
      .from(reviewViewEvents)
      .innerJoin(
        reviewShares,
        eq(reviewShares.id, reviewViewEvents.reviewShareId),
      )
      .innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId))
      .where(
        and(
          eq(reviewHubs.taskId, id),
          eq(reviewViewEvents.organizationId, actor.organizationId),
        ),
      )
      .orderBy(reviewViewEvents.viewedAt),
    db
      .select({
        id: reviewComments.id,
        body: reviewComments.body,
        reviewerName: reviewerSessions.displayName,
        resolvedAt: reviewComments.resolvedAt,
        createdAt: reviewComments.createdAt,
      })
      .from(reviewComments)
      .innerJoin(
        reviewShares,
        eq(reviewShares.id, reviewComments.reviewShareId),
      )
      .innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId))
      .leftJoin(
        reviewerSessions,
        eq(reviewerSessions.id, reviewComments.reviewerSessionId),
      )
      .where(
        and(
          eq(reviewHubs.taskId, id),
          eq(reviewComments.organizationId, actor.organizationId),
        ),
      )
      .orderBy(reviewComments.createdAt),
    db
      .select({
        id: assetRights.id,
        fileAssetId: assetRights.fileAssetId,
        kind: assetRights.kind,
        territory: assetRights.territory,
        channels: assetRights.channels,
        validUntil: assetRights.validUntil,
      })
      .from(assetRights)
      .innerJoin(fileAssets, eq(fileAssets.id, assetRights.fileAssetId))
      .where(
        and(
          eq(fileAssets.taskId, id),
          eq(assetRights.organizationId, actor.organizationId),
        ),
      )
      .orderBy(assetRights.validUntil),
    db
      .select({
        id: fileApprovals.id,
        fileVersionId: fileApprovals.fileVersionId,
      })
      .from(fileApprovals)
      .where(
        and(
          eq(fileApprovals.taskId, id),
          eq(fileApprovals.organizationId, actor.organizationId),
          isNull(fileApprovals.reopenedAt),
        ),
      )
      .limit(1),
  ]);
  const assets = assetRows.map((asset) => ({
    ...asset,
    versions: versionRows.filter((version) => version.fileAssetId === asset.id),
  }));
  const shares = shareRows.map((share) => {
    const views = viewRows.filter((view) => view.shareId === share.id);
    return {
      ...share,
      firstViewedAt: views[0]?.viewedAt ?? null,
      lastViewedAt: views.at(-1)?.viewedAt ?? null,
    };
  });
  const assignerIds = [...new Set(assignments.map((assignment) => assignment.assignedByMembershipId))];
  const [assignerRows, internalRows, mentionPeople, selectionRows] = await Promise.all([
    assignerIds.length ? db.select({ id: memberships.id, name: profiles.displayName }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), inArray(memberships.id, assignerIds))) : Promise.resolve([]),
    db.select({ id: internalComments.id, body: internalComments.body, createdAt: internalComments.createdAt, author: profiles.displayName }).from(internalComments).innerJoin(memberships, eq(memberships.id, internalComments.authorMembershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(internalComments.organizationId, actor.organizationId), eq(internalComments.taskId, id))).orderBy(internalComments.createdAt),
    db.select({ id: memberships.id, name: profiles.displayName, role: memberships.role, expiresAt: memberships.expiresAt }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(taskMentionScope(actor.organizationId, id)),
    db.select({ fileVersionId: taskReviewSelections.fileVersionId }).from(taskReviewSelections).where(and(eq(taskReviewSelections.organizationId, actor.organizationId), eq(taskReviewSelections.taskId, id))).limit(1),
  ]);
  const internalCommentIds = internalRows.map((comment) => comment.id);
  const mentionRows = internalCommentIds.length
    ? await db.select({ commentId: internalCommentMentions.commentId, name: profiles.displayName }).from(internalCommentMentions).innerJoin(memberships, eq(memberships.id, internalCommentMentions.mentionedMembershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(internalCommentMentions.organizationId, actor.organizationId), inArray(internalCommentMentions.commentId, internalCommentIds)))
    : [];
  const assignerNames = new Map(assignerRows.map((person) => [person.id, person.name]));
  const internalDiscussion = internalRows.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString(), mentions: mentionRows.filter((mention) => mention.commentId === comment.id).map((mention) => mention.name) }));
  const mentionMembers = mentionPeople.filter((person) => person.role !== "CLIENT" && person.id !== actor.membershipId && (!person.expiresAt || person.expiresAt > new Date())).map((person) => ({ id: person.id, name: person.name, role: person.role }));
  const primaryAssignment = assignments.find((assignment) => assignment.kind === "PRIMARY");
  const collaborators = assignments.filter((assignment) => assignment.kind === "COLLABORATOR");
  const currentStage = task.stateKind === "CLIENT_FEEDBACK_RECEIVED" ? "Client feedback" : task.stateKind === "COMPLETED" ? "Completed" : stages.find((stage) => stage.id === task.stageId)?.name ?? "Workflow";
  const canContribute = isOperationalLeader(actor.role) || actor.primaryTaskIds.has(id) || actor.collaboratorTaskIds.has(id) || actor.assignedByMeTaskIds.has(id);
  return (
    <>
      <nav className="mb-4 flex items-center gap-1 text-xs text-zinc-400">
        <Link href={`/projects/${task.projectId}`}>{task.project}</Link>
        <ChevronRight size={12} />
        <span>{task.name}</span>
      </nav>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={task.executionStatus === "BLOCKED" ? "rose" : task.executionStatus === "WAITING" ? "amber" : task.executionStatus === "COMPLETED" ? "green" : "cyan"}>{task.executionStatus.replaceAll("_", " ")}</Badge><Badge tone="violet">{currentStage}</Badge></div>
        <h1 className="display mt-2 text-3xl font-bold">{task.name}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {task.client} · {task.project} · {task.deliverable} · Due {task.dueAt.toLocaleString()}
        </p>
        {actor.role !== "CLIENT" && <Link href={`/work?new=task&project=${task.projectId}&deliverable=${task.deliverableId}`} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-700">Create related task</Link>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="surface rounded-2xl p-5">
          <h2 className="display text-lg font-bold">Task brief</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-600">
            {task.description || "No task brief has been added."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 p-3">
              <Clock3 size={15} className="text-violet-500" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Estimate / logged
              </p>
              <p className="mt-1 text-xs font-bold">
                {task.estimatedMinutes ?? "—"} min / {loggedMinutes} min
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Primary owner
              </p>
              <p className="mt-1 text-xs font-bold">
                {primaryAssignment?.membershipId === actor.membershipId ? "You" : primaryAssignment?.name ?? "Unassigned"}
              </p>
              {primaryAssignment && <p className="mt-1 text-[11px] text-zinc-400">Assigned by {assignerNames.get(primaryAssignment.assignedByMembershipId) ?? "a teammate"} · {primaryAssignment.assignedAt.toLocaleDateString()}</p>}
            </div>
            <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Collaborators</p><p className="mt-1 text-xs font-bold">{collaborators.length ? collaborators.map((assignment) => assignment.membershipId === actor.membershipId ? "You" : assignment.name).join(", ") : "None"}</p></div>
            <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Priority</p><p className="mt-1 text-xs font-bold">{task.priority}</p></div>
          </div>
          {(isOperationalLeader(actor.role) || actor.primaryTaskIds.has(id)) && (
            <TaskPhaseForm taskId={id} version={task.version} stageId={task.stageId} stages={stages} leader={isOperationalLeader(actor.role)}/>
          )}
        </section>
        <aside className="surface rounded-2xl p-5">
          <h2 className="display text-lg font-bold">Next action</h2>
          <TaskExecutionControls reviewers={mentionMembers.filter((member) => member.id !== primaryAssignment?.membershipId)} taskId={id} version={task.version} status={task.executionStatus} pendingRequest={Boolean(task.completionRequestedAt)} isPrimary={actor.primaryTaskIds.has(id)} isLeader={isOperationalLeader(actor.role)} isReviewer={task.completionReviewerMembershipId === actor.membershipId}/>
          {(actor.primaryTaskIds.has(id) || actor.collaboratorTaskIds.has(id)) && <><h2 className="display mt-7 border-t border-zinc-100 pt-5 text-lg font-bold">Log time</h2>
          <form action={logTime} className="mt-4 space-y-3">
            <input type="hidden" name="taskId" value={id} />
            <label className="block text-xs font-semibold text-zinc-500">
              Minutes
              <input
                name="minutes"
                type="number"
                min="1"
                required
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-xs font-semibold text-zinc-500">
              Work date
              <input
                name="workDate"
                type="date"
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <input
              name="note"
              maxLength={10000}
              placeholder="Note (optional)"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
            <Button type="submit" className="w-full">
              Save time
            </Button>
          </form></>}
        </aside>
      </div>
      <TaskDiscussion versions={versionRows.map((row) => ({ id: row.id, name: `V${row.versionNumber} · ${row.filename}` }))} taskId={id} comments={internalDiscussion} members={mentionMembers} canComment={canContribute}/>
      <TaskReviewHub
        taskId={id}
        taskVersion={task.version}
        activeApproval={approvalRows[0] ?? null}
        selectedReviewVersionId={selectionRows[0]?.fileVersionId ?? null}
        assets={assets}
        shares={shares}
        comments={commentRows}
        rights={rightRows}
        canShare={isOperationalLeader(actor.role) || actor.primaryTaskIds.has(id) || actor.collaboratorTaskIds.has(id)}
        canApprove={isOperationalLeader(actor.role) || actor.primaryTaskIds.has(id)}
        canManageRights={isOperationalLeader(actor.role)}
      />
    </>
  );
}
