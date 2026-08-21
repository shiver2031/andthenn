import { createHash, randomUUID } from "node:crypto";
import { closeDatabase, createDatabase } from "./client";
import {
  brands,
  capacitySchedules,
  clients,
  contacts,
  deliverables,
  featureFlags,
  fileAssets,
  fileVersions,
  intakeItems,
  intakeSourceItems,
  memberships,
  notificationPreferences,
  organizationSettings,
  organizations,
  profiles,
  projectMemberships,
  projects,
  proposals,
  rateCards,
  rateItems,
  reviewHubs,
  reviewShares,
  taskAssignees,
  tasks,
  workflows,
  workflowStages,
} from "./schema";

const { db } = createDatabase();

// Fixed identifiers make documented URLs, browser tests, and persona sessions
// deterministic. Scenario data created by the UI still uses database UUIDs.
const orgId = "20000000-0000-4000-8000-000000000001";
const managerProfileId = "21000000-0000-4000-8000-000000000001";
const producerProfileId = "21000000-0000-4000-8000-000000000002";
const editorProfileId = "21000000-0000-4000-8000-000000000003";
const tempProfileId = "21000000-0000-4000-8000-000000000004";
const expiredProfileId = "21000000-0000-4000-8000-000000000005";
const managerMembershipId = "22000000-0000-4000-8000-000000000001";
const producerMembershipId = "22000000-0000-4000-8000-000000000002";
const editorMembershipId = "22000000-0000-4000-8000-000000000003";
const tempMembershipId = "22000000-0000-4000-8000-000000000004";
const expiredMembershipId = "22000000-0000-4000-8000-000000000005";
const clientId = randomUUID();
const brandId = randomUUID();
const contactId = randomUUID();
const projectId = randomUUID();
const workflowId = randomUUID();
const assignedStageId = randomUUID();
const progressStageId = randomUUID();
const internalStageId = randomUUID();
const clientReviewStageId = randomUUID();
const deliverableId = randomUUID();
const taskId = randomUUID();
const fileAssetId = randomUUID();
const fileVersionId = randomUUID();
const reviewHubId = randomUUID();

await db.transaction(async (tx) => {
  await tx.insert(organizations).values({ id: orgId, name: "AndThenn Media", slug: "andthenn-media" }).onConflictDoNothing();
  await tx.insert(organizationSettings).values({
    organizationId: orgId,
    immediateEmailEvents: ["TASK_ASSIGNED", "MENTION", "DUE_RISK", "OVERDUE", "EXTERNAL_FEEDBACK", "TEMP_EXPIRING", "JOB_FAILED"],
    quotationLegalFields: { gstReady: true, placeOfSupply: "Maharashtra", currency: "INR" },
  }).onConflictDoNothing();
  await tx.insert(featureFlags).values([
    { organizationId: orgId, key: "AI_TRANSCRIPTION", enabled: false },
    { organizationId: orgId, key: "AI_OCR", enabled: false },
    { organizationId: orgId, key: "AI_SUGGESTIONS", enabled: false },
  ]).onConflictDoNothing();

  await tx.insert(profiles).values([
    { id: managerProfileId, authUserId: "10000000-0000-4000-8000-000000000001", displayName: "Mira Shah", email: "mira@andthenn.example" },
    { id: producerProfileId, authUserId: "10000000-0000-4000-8000-000000000002", displayName: "Arjun Menon", email: "arjun@andthenn.example" },
    { id: editorProfileId, authUserId: "10000000-0000-4000-8000-000000000003", displayName: "Naina Kapoor", email: "naina@andthenn.example" },
    { id: tempProfileId, authUserId: "10000000-0000-4000-8000-000000000004", displayName: "Kabir Rao", email: "kabir.freelance@example.com" },
    { id: expiredProfileId, authUserId: "10000000-0000-4000-8000-000000000005", displayName: "Nikhil Das", email: "nikhil.expired@example.com" },
  ]).onConflictDoNothing();

  await tx.insert(memberships).values([
    { id: managerMembershipId, organizationId: orgId, profileId: managerProfileId, role: "MANAGER", accountType: "PERMANENT", status: "ACTIVE", financeAccess: true },
    { id: producerMembershipId, organizationId: orgId, profileId: producerProfileId, role: "EMPLOYEE", accountType: "PERMANENT", status: "ACTIVE", financeAccess: false },
    { id: editorMembershipId, organizationId: orgId, profileId: editorProfileId, role: "EMPLOYEE", accountType: "PERMANENT", status: "ACTIVE", financeAccess: false },
    { id: tempMembershipId, organizationId: orgId, profileId: tempProfileId, role: "TEMP_FREELANCER", accountType: "TEMPORARY", status: "ACTIVE", expiresAt: new Date("2026-12-31T18:29:59.000Z") },
    { id: expiredMembershipId, organizationId: orgId, profileId: expiredProfileId, role: "TEMP_FREELANCER", accountType: "TEMPORARY", status: "EXPIRED", expiresAt: new Date("2026-01-01T00:00:00.000Z") },
  ]).onConflictDoNothing();

  await tx.insert(capacitySchedules).values([
    { organizationId: orgId, membershipId: managerMembershipId, effectiveFrom: "2026-01-01", weeklyMinutes: 1800 },
    { organizationId: orgId, membershipId: producerMembershipId, effectiveFrom: "2026-01-01", weeklyMinutes: 2400 },
    { organizationId: orgId, membershipId: editorMembershipId, effectiveFrom: "2026-01-01", weeklyMinutes: 2400 },
    { organizationId: orgId, membershipId: tempMembershipId, effectiveFrom: "2026-01-01", weeklyMinutes: 1200 },
  ]);

  await tx.insert(clients).values({ id: clientId, organizationId: orgId, name: "Aster House", notes: "Premium hospitality group" });
  await tx.insert(brands).values({ id: brandId, organizationId: orgId, clientId, name: "Aster Afterhours" });
  await tx.insert(contacts).values({ id: contactId, organizationId: orgId, clientId, brandId, name: "Riya Malhotra", roleLabel: "Brand Lead" });

  const rateCardId = randomUUID();
  await tx.insert(rateCards).values({ id: rateCardId, organizationId: orgId, clientId, name: "FY 2026 Production", currency: "INR" });
  await tx.insert(rateItems).values([
    { organizationId: orgId, rateCardId, serviceCode: "FILM-30", description: "30-second campaign film", unit: "film", standardPriceMinor: 850_000_00, effectiveFrom: "2026-04-01" },
    { organizationId: orgId, rateCardId, serviceCode: "SOCIAL-CUT", description: "Social cut-down", unit: "cut", standardPriceMinor: 65_000_00, effectiveFrom: "2026-04-01" },
  ]);

  const intakeId = randomUUID();
  await tx.insert(intakeItems).values({ id: intakeId, organizationId: orgId, status: "READY_FOR_DECISION", sourceChannel: "WHATSAPP", title: "Aster monsoon launch", confirmedClientId: clientId, confirmedSummary: "Launch film and social cut-downs for the monsoon menu." });
  await tx.insert(intakeSourceItems).values({
    organizationId: orgId,
    intakeItemId: intakeId,
    provider: "META_WHATSAPP",
    providerMessageId: "demo-wa-message-001",
    sender: "+919999999999",
    forwarder: "+918888888888",
    capturedAt: new Date("2026-08-03T10:15:00+05:30"),
    sequence: 1,
    kind: "TEXT",
    rawText: "Need a 30 sec launch film and 3 vertical edits before 21 August.",
    contentHash: createHash("sha256").update("demo-wa-message-001").digest("hex"),
  });

  await tx.insert(proposals).values({ organizationId: orgId, intakeItemId: intakeId, clientId, title: "Aster Afterhours — Monsoon launch", brief: "A cinematic launch film supported by three vertical cut-downs.", status: "PENDING", budgetMinor: 1_200_000_00 });

  await tx.insert(projects).values({ id: projectId, organizationId: orgId, clientId, sourceIntakeItemId: intakeId, ownerMembershipId: producerMembershipId, name: "Aster Afterhours / Monsoon", status: "ACTIVE", deadline: new Date("2026-08-21T18:00:00+05:30"), budgetMinor: 1_200_000_00, activatedAt: new Date("2026-08-02T12:00:00+05:30") });
  await tx.insert(projectMemberships).values([
    { organizationId: orgId, projectId, membershipId: producerMembershipId, canCreateTasks: true, canShareReviews: true },
    { organizationId: orgId, projectId, membershipId: editorMembershipId, canShareReviews: true },
  ]);
  await tx.insert(workflows).values({ id: workflowId, organizationId: orgId, projectId });
  await tx.insert(workflowStages).values([
    { id: assignedStageId, organizationId: orgId, workflowId, name: "Assigned", position: 0, semantic: "NORMAL" },
    { id: progressStageId, organizationId: orgId, workflowId, name: "In Progress", position: 1, semantic: "NORMAL" },
    { id: internalStageId, organizationId: orgId, workflowId, name: "Internal Review", position: 2, semantic: "NORMAL" },
    { id: clientReviewStageId, organizationId: orgId, workflowId, name: "Client Review", position: 3, semantic: "CLIENT_REVIEW" },
  ]);
  await tx.insert(deliverables).values({ id: deliverableId, organizationId: orgId, projectId, name: "Hero launch film", quantity: 1, format: "4K master + web proxy", dueAt: new Date("2026-08-18T18:00:00+05:30") });
  await tx.insert(tasks).values({ id: taskId, organizationId: orgId, deliverableId, currentWorkflowStageId: internalStageId, stateKind: "WORKFLOW", name: "Picture lock and sound mix", description: "Resolve internal notes, export V3, and prepare the selected version for client review.", priority: "HIGH", dueAt: new Date("2026-08-13T18:00:00+05:30"), estimatedMinutes: 960 });
  await tx.insert(taskAssignees).values([
    { organizationId: orgId, taskId, membershipId: editorMembershipId, kind: "PRIMARY", assignedByMembershipId: managerMembershipId },
    { organizationId: orgId, taskId, membershipId: producerMembershipId, kind: "COLLABORATOR", assignedByMembershipId: managerMembershipId },
  ]);
  await tx.insert(fileAssets).values({ id: fileAssetId, organizationId: orgId, taskId, logicalName: "Aster launch master" });
  await tx.insert(fileVersions).values({ id: fileVersionId, organizationId: orgId, fileAssetId, versionNumber: 2, filename: "aster-afterhours-v2.mp4", contentType: "video/mp4", sizeBytes: 482_000_000, checksumSha256: createHash("sha256").update("demo-file-v2").digest("hex"), storageProvider: "SUPABASE_S3", storageKey: `org/${orgId}/task/${taskId}/asset/${fileAssetId}/version/${fileVersionId}/aster-afterhours-v2.mp4`, uploaderMembershipId: editorMembershipId, processingStatus: "READY", mediaMetadata: { durationMs: 31_400, width: 1920, height: 1080 } });
  await tx.insert(reviewHubs).values({ id: reviewHubId, organizationId: orgId, taskId });
  await tx.insert(reviewShares).values({ organizationId: orgId, reviewHubId, fileVersionId, tokenHash: createHash("sha256").update("prototype-pepper:demo-review-token").digest("hex"), status: "ACTIVE", expiresAt: new Date("2026-12-03T18:29:59.000Z"), createdByMembershipId: producerMembershipId });

  for (const membershipId of [managerMembershipId, producerMembershipId, editorMembershipId]) {
    for (const eventType of ["TASK_ASSIGNED", "MENTION", "DUE_RISK", "OVERDUE", "EXTERNAL_FEEDBACK", "JOB_FAILED"]) {
      await tx.insert(notificationPreferences).values({ organizationId: orgId, membershipId, eventType, emailEnabled: true }).onConflictDoNothing();
    }
  }
});

console.warn(`Seeded AndThenn demo workspace ${orgId}`);
await closeDatabase();
