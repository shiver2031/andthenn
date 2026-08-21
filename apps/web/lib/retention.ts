import { and, auditEvents, createDatabase, eq, intakeItems, lt, organizationSettings, proposals } from "@andthenn/db";

export type RetentionPreview = { intakeCandidates: number; draftCandidates: number; auditCandidates: number };

/** Reporting only: destructive retention has no application code path in Phase 1. */
export async function previewRetention(organizationId: string): Promise<RetentionPreview> {
  const { db } = createDatabase();
  const [settings] = await db.select().from(organizationSettings).where(eq(organizationSettings.organizationId, organizationId)).limit(1);
  if (!settings) throw new Error("Retention policy is not configured");
  const now = Date.now();
  const [intakeCandidates, draftCandidates, auditCandidates] = await Promise.all([
    db.$count(intakeItems, and(eq(intakeItems.organizationId, organizationId), lt(intakeItems.createdAt, new Date(now - settings.intakeRetentionDays * 86_400_000)))),
    db.$count(proposals, and(eq(proposals.organizationId, organizationId), lt(proposals.createdAt, new Date(now - settings.draftRetentionDays * 86_400_000)))),
    db.$count(auditEvents, and(eq(auditEvents.organizationId, organizationId), lt(auditEvents.createdAt, new Date(now - settings.auditRetentionDays * 86_400_000)))),
  ]);
  return { intakeCandidates, draftCandidates, auditCandidates };
}
