import { and, annotations, createDatabase, deliverables, eq, projects, reviewComments, reviewerSessions, reviewHubs, reviewShares, tasks } from "@andthenn/db";
import { can } from "@andthenn/domain";
import { NextResponse } from "next/server";
import { resolveActorContext } from "../../../../../lib/actor-context";
import { createTextPdf } from "../../../../../lib/simple-pdf";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params; const { db } = createDatabase();
  const [task] = await db.select({ id: tasks.id, name: tasks.name, projectId: projects.id, projectName: projects.name }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(and(eq(tasks.id, id), eq(tasks.organizationId, actor.organizationId))).limit(1);
  if (!task || !can(actor, "reviews:comment", { taskId: id, projectId: task.projectId })) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const comments = await db.select({ reviewer: reviewerSessions.displayName, body: reviewComments.body, createdAt: reviewComments.createdAt, resolvedAt: reviewComments.resolvedAt, kind: annotations.kind, timeMs: annotations.timeMs, page: annotations.page }).from(reviewComments).innerJoin(reviewShares, eq(reviewShares.id, reviewComments.reviewShareId)).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).leftJoin(reviewerSessions, eq(reviewerSessions.id, reviewComments.reviewerSessionId)).leftJoin(annotations, eq(annotations.reviewCommentId, reviewComments.id)).where(and(eq(reviewHubs.taskId, id), eq(reviewComments.organizationId, actor.organizationId))).orderBy(reviewComments.createdAt);
  const format = new URL(request.url).searchParams.get("format") ?? "csv"; const basename = `${task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-feedback`;
  if (format === "pdf") {
    const lines = comments.map((item, index) => `${index + 1}. ${item.reviewer ?? "Internal reviewer"} | ${item.createdAt.toISOString()} | ${item.resolvedAt ? "Resolved" : "Outstanding"} | ${item.kind ?? "GENERAL"}${item.timeMs === null ? "" : ` @ ${Math.floor(item.timeMs / 1000)}s`}${item.page === null ? "" : ` p.${item.page}`} | ${item.body}`);
    return new Response(createTextPdf(`${task.projectName} - ${task.name} feedback`, lines), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${basename}.pdf"`, "cache-control": "no-store" } });
  }
  const rows = ["reviewer,created_at,status,annotation,time_ms,page,comment", ...comments.map((item) => [item.reviewer, item.createdAt.toISOString(), item.resolvedAt ? "Resolved" : "Outstanding", item.kind ?? "GENERAL", item.timeMs, item.page, item.body].map(csv).join(","))];
  return new Response(rows.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${basename}.csv"`, "cache-control": "no-store" } });
}
