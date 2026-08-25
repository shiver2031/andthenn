import { Badge, Button } from "@andthenn/ui";
import Link from "next/link";
import { ChevronRight, Clock3 } from "lucide-react";
import {
  and,
  assetRights,
  createDatabase,
  deliverables,
  eq,
  fileApprovals,
  fileAssets,
  fileVersions,
  isNull,
  projects,
  reviewComments,
  reviewerSessions,
  reviewHubs,
  reviewShares,
  reviewViewEvents,
  taskAssignees,
  tasks,
  timeEntries,
  workflowStages,
  workflows,
} from "@andthenn/db";
import { notFound } from "next/navigation";
import { logTime, moveTask } from "../../actions";
import { resolveActorContext } from "../../../../lib/actor-context";
import { TaskReviewHub } from "../../../../components/task-review-hub";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await resolveActorContext();
  if (!actor) return null;
  const { db } = createDatabase();
  const [task] = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      description: tasks.description,
      dueAt: tasks.dueAt,
      estimatedMinutes: tasks.estimatedMinutes,
      version: tasks.version,
      stageId: tasks.currentWorkflowStageId,
      stateKind: tasks.stateKind,
      deliverable: deliverables.name,
      projectId: projects.id,
      project: projects.name,
      projectOwnerId: projects.ownerMembershipId,
    })
    .from(tasks)
    .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
    .innerJoin(projects, eq(projects.id, deliverables.projectId))
    .where(
      and(eq(tasks.id, id), eq(tasks.organizationId, actor.organizationId)),
    )
    .limit(1);
  if (
    !task ||
    (actor.role !== "MANAGER" &&
      !actor.primaryTaskIds.has(id) &&
      !actor.collaboratorTaskIds.has(id))
  )
    notFound();
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
      .select()
      .from(taskAssignees)
      .where(
        and(
          eq(taskAssignees.taskId, id),
          eq(taskAssignees.organizationId, actor.organizationId),
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
  return (
    <>
      <nav className="mb-4 flex items-center gap-1 text-xs text-zinc-400">
        <Link href={`/projects/${task.projectId}`}>{task.project}</Link>
        <ChevronRight size={12} />
        <span>{task.name}</span>
      </nav>
      <div className="mb-6">
        <Badge tone="cyan">{task.stateKind}</Badge>
        <h1 className="display mt-2 text-3xl font-bold">{task.name}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {task.deliverable} · Due {task.dueAt.toLocaleString()}
        </p>
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
                {assignments.find((a) => a.kind === "PRIMARY")?.membershipId ===
                actor.membershipId
                  ? "You"
                  : "Assigned member"}
              </p>
            </div>
          </div>
          {(actor.role === "MANAGER" || actor.primaryTaskIds.has(id)) && (
            <form action={moveTask} className="mt-5 flex flex-wrap gap-2">
              <input type="hidden" name="taskId" value={id} />
              <input
                type="hidden"
                name="expectedVersion"
                value={task.version}
              />
              <select
                name="targetStageId"
                defaultValue={task.stageId ?? ""}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
              {actor.role === "MANAGER" && (
                <input
                  name="reason"
                  minLength={3}
                  placeholder="Override reason (if needed)"
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              )}
              <Button type="submit">Move task</Button>
            </form>
          )}
        </section>
        <aside className="surface rounded-2xl p-5">
          <h2 className="display text-lg font-bold">Log time</h2>
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
          </form>
        </aside>
      </div>
      <TaskReviewHub
        taskId={id}
        taskVersion={task.version}
        activeApproval={approvalRows[0] ?? null}
        assets={assets}
        shares={shares}
        comments={commentRows}
        rights={rightRows}
        canShare={actor.role === "MANAGER" || actor.primaryTaskIds.has(id) || actor.collaboratorTaskIds.has(id)}
        canApprove={actor.role === "MANAGER" || actor.primaryTaskIds.has(id)}
        canManageRights={actor.role === "MANAGER"}
      />
    </>
  );
}
