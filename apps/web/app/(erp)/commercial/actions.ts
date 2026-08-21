"use server";

import {
  activityEvents,
  and,
  archiveJobs,
  auditEvents,
  clients,
  createDatabase,
  deliverables,
  eq,
  fileAssets,
  fileVersions,
  invoiceRecords,
  invoiceRevisions,
  isNull,
  organizationSettings,
  outboxEvents,
  projectClosureChecklistItems,
  projectClosureEvents,
  projectRetrospectives,
  projects,
  quoteAcceptanceEvents,
  quoteAcceptanceLinks,
  quoteLines,
  quotes,
  quoteVersions,
  rateCards,
  rateItems,
  sql,
  tasks,
  templateImprovementSuggestions,
  timeEntries,
  reviewComments,
  reviewHubs,
  reviewShares,
} from "@andthenn/db";
import { calculateQuote, calculateQuoteLine } from "@andthenn/domain";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  resolveActorContext,
  type ActorContext,
} from "../../../lib/actor-context";
import { demoModeEnabled } from "../../../lib/config";
import { createTextPdf } from "../../../lib/simple-pdf";
import { hashQuoteToken } from "../../../lib/security";
import { createStorage } from "../../../lib/storage";

const field = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
const required = (form: FormData, name: string) => {
  const value = field(form, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const integer = (
  form: FormData,
  name: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) => {
  const value = Number(required(form, name));
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(
      `${name} must be a whole minor-unit value between ${min} and ${max}`,
    );
  return value;
};

async function managerOrThrow() {
  if (demoModeEnabled()) throw new Error("Demo mode is read-only");
  const actor = await resolveActorContext();
  if (!actor) throw new Error("Authentication required");
  if (actor.role !== "MANAGER") throw new Error("Manager permission required");
  return actor;
}

async function audit(
  tx: ReturnType<typeof createDatabase>["db"],
  actor: ActorContext,
  action: string,
  objectType: string,
  objectId: string,
  before: unknown,
  after: unknown,
  reason?: string,
) {
  await tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    actorSnapshot: `${actor.displayName} <${actor.email}>`,
    source: "SERVER_ACTION",
    action,
    objectType,
    objectId,
    before: before ?? null,
    after: after ?? null,
    reason: reason || null,
    correlationId: crypto.randomUUID(),
  });
  await tx.insert(activityEvents).values({
    organizationId: actor.organizationId,
    actorMembershipId: actor.membershipId,
    eventType: action,
    entityType: objectType,
    entityId: objectId,
    source: "SERVER_ACTION",
    snapshot: after ?? {},
  });
}

async function scopedProject(
  db: ReturnType<typeof createDatabase>["db"],
  actor: ActorContext,
  projectId: string,
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!project) throw new Error("Project not found");
  return project;
}

export async function saveProjectBudget(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId");
  const amountMinor = integer(form, "budgetMinor");
  const currency = required(form, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Currency must be a three-letter ISO code");
  const { db } = createDatabase();
  const project = await scopedProject(db, actor, projectId);
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(projects)
      .set({
        budgetMinor: amountMinor,
        currency,
        budgetNotes: field(form, "budgetNotes") || null,
        version: project.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(eq(projects.id, projectId), eq(projects.version, project.version)),
      )
      .returning({ id: projects.id });
    if (!changed) throw new Error("Project budget changed; refresh and retry");
    await audit(
      tx as never,
      actor,
      "project.budget_updated",
      "PROJECT",
      projectId,
      {
        amountMinor: project.budgetMinor,
        currency: project.currency,
        notes: project.budgetNotes,
      },
      { amountMinor, currency, notes: field(form, "budgetNotes") || null },
    );
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/commercial");
}

export async function createProjectQuote(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId"),
    rateCardId = field(form, "rateCardId") || null;
  const validUntil = required(form, "validUntil");
  if (validUntil < new Date().toISOString().slice(0, 10))
    throw new Error("Quotation validity cannot be in the past");
  const { db } = createDatabase();
  const project = await scopedProject(db, actor, projectId);
  const deliveries = await db
    .select()
    .from(deliverables)
    .where(
      and(
        eq(deliverables.projectId, projectId),
        eq(deliverables.organizationId, actor.organizationId),
      ),
    )
    .orderBy(deliverables.dueAt);
  if (!deliveries.length)
    throw new Error(
      "Add at least one deliverable before generating a quotation",
    );
  let rates: Array<typeof rateItems.$inferSelect> = [];
  if (rateCardId) {
    const [card] = await db
      .select()
      .from(rateCards)
      .where(
        and(
          eq(rateCards.id, rateCardId),
          eq(rateCards.clientId, project.clientId),
          eq(rateCards.organizationId, actor.organizationId),
          eq(rateCards.lifecycle, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!card)
      throw new Error("Rate card is not active for this project client");
    rates = await db
      .select()
      .from(rateItems)
      .where(
        and(
          eq(rateItems.rateCardId, card.id),
          eq(rateItems.organizationId, actor.organizationId),
          sql`${rateItems.effectiveFrom} <= current_date`,
          sql`(${rateItems.effectiveTo} is null or ${rateItems.effectiveTo} >= current_date)`,
        ),
      )
      .orderBy(sql`${rateItems.effectiveFrom} desc`);
  }
  await db.transaction(async (tx) => {
    const [quote] = await tx
      .insert(quotes)
      .values({
        organizationId: actor.organizationId,
        clientId: project.clientId,
        projectId,
        currency: project.currency,
      })
      .returning({ id: quotes.id });
    const [version] = await tx
      .insert(quoteVersions)
      .values({
        organizationId: actor.organizationId,
        quoteId: quote!.id,
        versionNumber: 1,
        validUntil,
        interstateGst: form.get("interstateGst") === "on",
        notes: field(form, "notes") || null,
      })
      .returning({ id: quoteVersions.id });
    for (const [position, delivery] of deliveries.entries()) {
      const key = delivery.format.trim().toLowerCase();
      const rate = rates.find(
        (item) =>
          item.serviceCode.toLowerCase() === key ||
          item.description.toLowerCase() === delivery.name.toLowerCase(),
      );
      const unitRateMinor = rate?.standardPriceMinor ?? 0;
      const total = calculateQuoteLine({
        description: delivery.name,
        quantity: delivery.quantity,
        unitRateMinor,
        discountBasisPoints: 0,
        taxBasisPoints: 1800,
      });
      await tx.insert(quoteLines).values({
        organizationId: actor.organizationId,
        quoteVersionId: version!.id,
        position,
        rateItemId: rate?.id ?? null,
        sourceDescription: rate?.description ?? null,
        sourceUnitRateMinor: rate?.standardPriceMinor ?? null,
        finalDescription: delivery.name,
        quantity: delivery.quantity,
        unitRateMinor,
        discountBasisPoints: 0,
        taxBasisPoints: 1800,
        lineTotalMinor: total.totalMinor,
        overrideReason: rate
          ? null
          : "No matching effective rate; manager input required",
      });
    }
    await audit(tx as never, actor, "quote.created", "QUOTE", quote!.id, null, {
      projectId,
      quoteVersionId: version!.id,
      lineCount: deliveries.length,
      rateCardId,
    });
  });
  revalidatePath("/commercial");
}

export async function updateQuoteLine(form: FormData) {
  const actor = await managerOrThrow(),
    lineId = required(form, "lineId");
  const description = required(form, "description"),
    quantity = integer(form, "quantity", { min: 1, max: 100_000 });
  const unitRateMinor = integer(form, "unitRateMinor"),
    discountBasisPoints = integer(form, "discountBasisPoints", { max: 10_000 }),
    taxBasisPoints = integer(form, "taxBasisPoints", { max: 10_000 });
  const overrideReason = field(form, "overrideReason") || null;
  const { db } = createDatabase();
  const [line] = await db
    .select({
      id: quoteLines.id,
      quoteVersionId: quoteLines.quoteVersionId,
      sourceDescription: quoteLines.sourceDescription,
      sourceUnitRateMinor: quoteLines.sourceUnitRateMinor,
      status: quoteVersions.status,
    })
    .from(quoteLines)
    .innerJoin(quoteVersions, eq(quoteVersions.id, quoteLines.quoteVersionId))
    .where(
      and(
        eq(quoteLines.id, lineId),
        eq(quoteLines.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!line || line.status !== "DRAFT")
    throw new Error("Only draft quotation lines can be edited");
  if (
    (line.sourceDescription !== description ||
      line.sourceUnitRateMinor !== unitRateMinor) &&
    (!overrideReason || overrideReason.length < 3)
  )
    throw new Error(
      "A reason is required when overriding source rate-card values",
    );
  const totals = calculateQuoteLine({
    description,
    quantity,
    unitRateMinor,
    discountBasisPoints,
    taxBasisPoints,
  });
  await db.transaction(async (tx) => {
    await tx
      .update(quoteLines)
      .set({
        finalDescription: description,
        quantity,
        unitRateMinor,
        discountBasisPoints,
        taxBasisPoints,
        lineTotalMinor: totals.totalMinor,
        overrideReason,
      })
      .where(eq(quoteLines.id, lineId));
    await audit(
      tx as never,
      actor,
      "quote.line_updated",
      "QUOTE_LINE",
      lineId,
      null,
      {
        description,
        quantity,
        unitRateMinor,
        discountBasisPoints,
        taxBasisPoints,
        overrideReason,
      },
    );
  });
  revalidatePath("/commercial");
}

async function uploadQuotationPdf(
  actor: ActorContext,
  quoteVersionId: string,
  pdf: Buffer,
  checksum: string,
) {
  const storage = createStorage();
  const filename = `quotation-${quoteVersionId}.pdf`;
  const upload = await storage.initiateUpload({
    organizationId: actor.organizationId,
    taskId: "commercial",
    fileVersionId: quoteVersionId,
    filename,
    contentType: "application/pdf",
    sizeBytes: pdf.byteLength,
    checksumSha256: checksum,
  });
  if (upload.mode !== "SINGLE" || !upload.uploadUrl)
    throw new Error("Quotation PDF storage must use a signed single upload");
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "application/pdf",
      "x-amz-meta-sha256": checksum,
      "x-amz-meta-file-version-id": quoteVersionId,
    },
    body: new Uint8Array(pdf),
  });
  if (!response.ok)
    throw new Error(`Quotation PDF upload failed (${response.status})`);
  return storage.finalizeUpload({
    organizationId: actor.organizationId,
    taskId: "commercial",
    fileVersionId: quoteVersionId,
    filename,
    contentType: "application/pdf",
    sizeBytes: pdf.byteLength,
    checksumSha256: checksum,
    uploadId: upload.uploadId,
  });
}

export async function finalizeQuoteVersion(form: FormData) {
  const actor = await managerOrThrow(),
    quoteVersionId = required(form, "quoteVersionId"),
    { db } = createDatabase();
  const [version] = await db
    .select({
      id: quoteVersions.id,
      quoteId: quoteVersions.quoteId,
      versionNumber: quoteVersions.versionNumber,
      status: quoteVersions.status,
      validUntil: quoteVersions.validUntil,
      currency: quotes.currency,
      clientName: clients.name,
      projectId: quotes.projectId,
    })
    .from(quoteVersions)
    .innerJoin(quotes, eq(quotes.id, quoteVersions.quoteId))
    .innerJoin(clients, eq(clients.id, quotes.clientId))
    .where(
      and(
        eq(quoteVersions.id, quoteVersionId),
        eq(quoteVersions.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!version || version.status !== "DRAFT")
    throw new Error("Draft quotation version not found");
  const lines = await db
    .select()
    .from(quoteLines)
    .where(
      and(
        eq(quoteLines.quoteVersionId, version.id),
        eq(quoteLines.organizationId, actor.organizationId),
      ),
    )
    .orderBy(quoteLines.position);
  if (lines.some((line) => line.unitRateMinor <= 0))
    throw new Error(
      "Every quotation line requires a positive unit rate before finalization",
    );
  const totals = calculateQuote(
    lines.map((line) => ({
      description: line.finalDescription,
      quantity: line.quantity,
      unitRateMinor: line.unitRateMinor,
      discountBasisPoints: line.discountBasisPoints,
      taxBasisPoints: line.taxBasisPoints,
    })),
  );
  const [settings] = await db
    .select({ legal: organizationSettings.quotationLegalFields })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, actor.organizationId))
    .limit(1);
  const legal = (settings?.legal ?? {}) as Record<string, unknown>;
  const pdf = createTextPdf(
    `Quotation ${version.versionNumber} - ${version.clientName}`,
    [
      ...lines.map(
        (line, index) =>
          `${index + 1}. ${line.finalDescription} | ${line.quantity} x ${line.unitRateMinor} | total ${line.lineTotalMinor} minor units`,
      ),
      `Subtotal: ${totals.subtotalMinor}`,
      `Discount: ${totals.discountMinor}`,
      `Tax: ${totals.taxMinor}`,
      `Total ${version.currency}: ${totals.totalMinor}`,
      `Valid until: ${version.validUntil ?? "Not specified"}`,
      ...Object.entries(legal)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => `${key}: ${String(value)}`),
    ],
  );
  const checksum = createHash("sha256").update(pdf).digest("hex"),
    stored = await uploadQuotationPdf(actor, version.id, pdf, checksum);
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(quoteVersions)
      .set({
        status: "FINAL",
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        legalSnapshot: legal,
        pdfStorageKey: stored.objectKey,
        pdfChecksumSha256: checksum,
        publishedAt: new Date(),
        finalizedAt: new Date(),
        finalizedByMembershipId: actor.membershipId,
      })
      .where(
        and(
          eq(quoteVersions.id, version.id),
          eq(quoteVersions.status, "DRAFT"),
          isNull(quoteVersions.finalizedAt),
        ),
      )
      .returning({ id: quoteVersions.id });
    if (!changed)
      throw new Error("Quotation version changed; refresh and retry");
    await tx
      .update(quotes)
      .set({ status: "ISSUED", updatedAt: new Date() })
      .where(eq(quotes.id, version.quoteId));
    await audit(
      tx as never,
      actor,
      "quote.version_finalized",
      "QUOTE_VERSION",
      version.id,
      null,
      { ...totals, pdfChecksumSha256: checksum, legalSnapshot: legal },
    );
  });
  revalidatePath("/commercial");
}

export async function reviseQuoteVersion(form: FormData) {
  const actor = await managerOrThrow(),
    sourceVersionId = required(form, "quoteVersionId"),
    { db } = createDatabase();
  const [source] = await db
    .select()
    .from(quoteVersions)
    .where(
      and(
        eq(quoteVersions.id, sourceVersionId),
        eq(quoteVersions.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!source || !source.finalizedAt)
    throw new Error("Only a finalized quotation can be revised");
  const sourceLines = await db
    .select()
    .from(quoteLines)
    .where(eq(quoteLines.quoteVersionId, source.id))
    .orderBy(quoteLines.position);
  const [latest] = await db
    .select({ number: sql<number>`max(${quoteVersions.versionNumber})::int` })
    .from(quoteVersions)
    .where(eq(quoteVersions.quoteId, source.quoteId));
  await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(quoteVersions)
      .values({
        organizationId: actor.organizationId,
        quoteId: source.quoteId,
        versionNumber: (latest?.number ?? source.versionNumber) + 1,
        validUntil: field(form, "validUntil") || source.validUntil,
        interstateGst: source.interstateGst,
        notes: field(form, "notes") || source.notes,
      })
      .returning({ id: quoteVersions.id });
    if (sourceLines.length)
      await tx.insert(quoteLines).values(
        sourceLines.map((line) => ({
          organizationId: actor.organizationId,
          quoteVersionId: version!.id,
          position: line.position,
          rateItemId: line.rateItemId,
          sourceDescription: line.sourceDescription,
          sourceUnitRateMinor: line.sourceUnitRateMinor,
          finalDescription: line.finalDescription,
          quantity: line.quantity,
          unitRateMinor: line.unitRateMinor,
          discountBasisPoints: line.discountBasisPoints,
          taxBasisPoints: line.taxBasisPoints,
          lineTotalMinor: line.lineTotalMinor,
          overrideReason: line.overrideReason,
        })),
      );
    await audit(
      tx as never,
      actor,
      "quote.version_created",
      "QUOTE_VERSION",
      version!.id,
      null,
      {
        sourceVersionId: source.id,
        versionNumber: (latest?.number ?? source.versionNumber) + 1,
      },
    );
  });
  revalidatePath("/commercial");
}

export async function createQuoteAcceptanceLink(form: FormData) {
  const actor = await managerOrThrow(),
    quoteVersionId = required(form, "quoteVersionId"),
    { db } = createDatabase();
  const [version] = await db
    .select({
      id: quoteVersions.id,
      checksum: quoteVersions.pdfChecksumSha256,
      finalizedAt: quoteVersions.finalizedAt,
      legal: quoteVersions.legalSnapshot,
    })
    .from(quoteVersions)
    .where(
      and(
        eq(quoteVersions.id, quoteVersionId),
        eq(quoteVersions.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!version?.finalizedAt || !version.checksum)
    throw new Error("Finalize the quotation PDF before sharing it");
  if (
    (version.legal as Record<string, unknown>).externalAcceptanceApproved !==
    true
  )
    throw new Error(
      "Legal review must set externalAcceptanceApproved before external acceptance is enabled",
    );
  const rawExpiry = field(form, "expiresAt"),
    expiresAt = rawExpiry ? new Date(rawExpiry) : null;
  if (
    expiresAt &&
    (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())
  )
    throw new Error("Expiry must be in the future");
  const token = randomBytes(32).toString("base64url");
  const [link] = await db
    .insert(quoteAcceptanceLinks)
    .values({
      organizationId: actor.organizationId,
      quoteVersionId,
      tokenHash: hashQuoteToken(token),
      expiresAt,
      createdByMembershipId: actor.membershipId,
    })
    .returning({ id: quoteAcceptanceLinks.id });
  await db.insert(quoteAcceptanceEvents).values({
    organizationId: actor.organizationId,
    acceptanceLinkId: link!.id,
    eventType: "CREATED",
    evidence: { quoteVersionId, expiresAt: expiresAt?.toISOString() ?? null },
  });
  revalidatePath("/commercial");
  return {
    id: link!.id,
    url: `${process.env.APP_URL ?? "http://localhost:3000"}/quote/${token}`,
  };
}

export async function revokeQuoteAcceptanceLink(form: FormData) {
  const actor = await managerOrThrow(),
    linkId = required(form, "linkId"),
    { db } = createDatabase();
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(quoteAcceptanceLinks)
      .set({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(quoteAcceptanceLinks.id, linkId),
          eq(quoteAcceptanceLinks.organizationId, actor.organizationId),
          eq(quoteAcceptanceLinks.status, "ACTIVE"),
        ),
      )
      .returning({ id: quoteAcceptanceLinks.id });
    if (!changed) throw new Error("Active acceptance link not found");
    await tx.insert(quoteAcceptanceEvents).values({
      organizationId: actor.organizationId,
      acceptanceLinkId: linkId,
      eventType: "REVOKED",
      evidence: { actorMembershipId: actor.membershipId },
    });
    await audit(
      tx as never,
      actor,
      "quote.acceptance_revoked",
      "QUOTE_ACCEPTANCE",
      linkId,
      { status: "ACTIVE" },
      { status: "REVOKED" },
    );
  });
  revalidatePath("/commercial");
}

export async function saveInvoice(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId"),
    status = required(form, "status");
  const allowed = [
    "NOT_RAISED",
    "DRAFT",
    "SENT",
    "PARTIALLY_PAID",
    "PAID",
    "OVERDUE",
    "CANCELLED",
  ] as const;
  if (!allowed.includes(status as (typeof allowed)[number]))
    throw new Error("Invalid invoice status");
  const amountMinor = field(form, "amountMinor")
      ? integer(form, "amountMinor")
      : null,
    currency = required(form, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Currency must be a three-letter ISO code");
  const issuedAt = field(form, "issuedAt") || null,
    dueAt = field(form, "dueAt") || null,
    paidAt = field(form, "paidAt") || null;
  if (issuedAt && dueAt && dueAt < issuedAt)
    throw new Error("Invoice due date cannot precede its issue date");
  if (
    (status === "SENT" ||
      status === "PARTIALLY_PAID" ||
      status === "PAID" ||
      status === "OVERDUE") &&
    (!issuedAt || amountMinor === null)
  )
    throw new Error("Issued invoice states require an issue date and amount");
  if (status === "PAID" && !paidAt)
    throw new Error("A paid invoice requires its paid date");
  const { db } = createDatabase();
  await scopedProject(db, actor, projectId);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(invoiceRecords)
      .where(
        and(
          eq(invoiceRecords.projectId, projectId),
          eq(invoiceRecords.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    const values = {
      status: status as (typeof allowed)[number],
      amountMinor,
      currency,
      reference: field(form, "reference") || null,
      issuedAt,
      dueAt,
      paidAt,
      notes: field(form, "notes") || null,
      updatedAt: new Date(),
    };
    const [invoice] = before
      ? await tx
          .update(invoiceRecords)
          .set(values)
          .where(eq(invoiceRecords.id, before.id))
          .returning()
      : await tx
          .insert(invoiceRecords)
          .values({
            organizationId: actor.organizationId,
            projectId,
            ...values,
          })
          .returning();
    await tx.insert(invoiceRevisions).values({
      organizationId: actor.organizationId,
      invoiceRecordId: invoice!.id,
      actorMembershipId: actor.membershipId,
      before: before ?? null,
      after: invoice!,
      reason: field(form, "reason") || null,
    });
    await audit(
      tx as never,
      actor,
      "invoice.updated",
      "INVOICE",
      invoice!.id,
      before ?? null,
      invoice!,
      field(form, "reason") || undefined,
    );
  });
  revalidatePath("/commercial");
  revalidatePath(`/projects/${projectId}`);
}

export async function confirmDeliverable(form: FormData) {
  const actor = await managerOrThrow(),
    deliverableId = required(form, "deliverableId"),
    { db } = createDatabase();
  await db.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(deliverables)
      .where(
        and(
          eq(deliverables.id, deliverableId),
          eq(deliverables.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!delivery || delivery.status !== "READY_FOR_MANAGER_CONFIRMATION")
      throw new Error("Deliverable is not ready for manager confirmation");
    const openTasks = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.deliverableId, deliverableId),
          sql`${tasks.stateKind} <> 'COMPLETED'`,
        ),
      )
      .limit(1);
    if (openTasks.length)
      throw new Error("All deliverable tasks must be complete");
    await tx
      .update(deliverables)
      .set({
        status: "COMPLETED",
        confirmedAt: new Date(),
        confirmedByMembershipId: actor.membershipId,
        updatedAt: new Date(),
      })
      .where(eq(deliverables.id, deliverableId));
    const incomplete = await tx
      .select({ id: deliverables.id })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.projectId, delivery.projectId),
          sql`${deliverables.status} <> 'COMPLETED'`,
        ),
      )
      .limit(1);
    if (!incomplete.length)
      await tx
        .update(projects)
        .set({ status: "READY_FOR_FINAL_CLOSURE", updatedAt: new Date() })
        .where(
          and(
            eq(projects.id, delivery.projectId),
            sql`${projects.status} in ('ACTIVE','REOPENED')`,
          ),
        );
    await audit(
      tx as never,
      actor,
      "deliverable.confirmed",
      "DELIVERABLE",
      deliverableId,
      { status: delivery.status },
      { status: "COMPLETED" },
    );
  });
  revalidatePath("/commercial");
}

export async function reopenDeliverable(form: FormData) {
  const actor = await managerOrThrow(),
    deliverableId = required(form, "deliverableId"),
    reason = required(form, "reason");
  if (reason.length < 3)
    throw new Error("A meaningful reopen reason is required");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(deliverables)
      .where(
        and(
          eq(deliverables.id, deliverableId),
          eq(deliverables.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!delivery || delivery.status !== "COMPLETED")
      throw new Error("Completed deliverable not found");
    await tx
      .update(deliverables)
      .set({
        status: "REOPENED",
        confirmedAt: null,
        confirmedByMembershipId: null,
        reopenReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(deliverables.id, delivery.id));
    await tx
      .update(projects)
      .set({
        status: "REOPENED",
        reopenedAt: new Date(),
        reopenReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, delivery.projectId));
    await audit(
      tx as never,
      actor,
      "deliverable.reopened",
      "DELIVERABLE",
      delivery.id,
      { status: "COMPLETED" },
      { status: "REOPENED" },
      reason,
    );
  });
  revalidatePath("/commercial");
}

export async function seedClosureChecklist(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId"),
    { db } = createDatabase();
  const project = await scopedProject(db, actor, projectId);
  if (project.status !== "READY_FOR_FINAL_CLOSURE")
    throw new Error("Project is not ready for closure");
  const defaults = [
    ["approved_files", "Final approved files verified"],
    ["rights", "Rights and releases checked"],
    ["invoice", "Invoice status reviewed"],
    ["archive", "Archive destination confirmed"],
  ] as const;
  await db
    .insert(projectClosureChecklistItems)
    .values(
      defaults.map(([key, label]) => ({
        organizationId: actor.organizationId,
        projectId,
        key,
        label,
      })),
    )
    .onConflictDoNothing();
  revalidatePath("/commercial");
}

export async function toggleClosureChecklistItem(form: FormData) {
  const actor = await managerOrThrow(),
    itemId = required(form, "itemId"),
    { db } = createDatabase();
  const [item] = await db
    .select()
    .from(projectClosureChecklistItems)
    .where(
      and(
        eq(projectClosureChecklistItems.id, itemId),
        eq(projectClosureChecklistItems.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!item) throw new Error("Closure item not found");
  const completedAt = item.completedAt ? null : new Date();
  await db
    .update(projectClosureChecklistItems)
    .set({
      completedAt,
      completedByMembershipId: completedAt ? actor.membershipId : null,
      note: field(form, "note") || item.note,
      updatedAt: new Date(),
    })
    .where(eq(projectClosureChecklistItems.id, item.id));
  revalidatePath("/commercial");
}

export async function queueProjectArchive(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId"),
    { db } = createDatabase();
  const project = await scopedProject(db, actor, projectId);
  if (project.status !== "READY_FOR_FINAL_CLOSURE")
    throw new Error("Project is not ready to archive");
  const defaultDestination = `archive/org/${actor.organizationId}/projects/${projectId}`;
  const destinationPrefix =
    field(form, "destinationPrefix") || defaultDestination;
  if (!destinationPrefix.startsWith(`archive/org/${actor.organizationId}/`))
    throw new Error("Archive destination must remain inside this organization");
  const destinationReason = field(form, "destinationReason");
  if (destinationPrefix !== defaultDestination && destinationReason.length < 3)
    throw new Error(
      "A reason is required when overriding the archive destination",
    );
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(archiveJobs)
      .values({
        organizationId: actor.organizationId,
        projectId,
        destinationPrefix,
        managerOverride: destinationPrefix !== defaultDestination,
      })
      .returning({ id: archiveJobs.id });
    await tx.insert(outboxEvents).values({
      organizationId: actor.organizationId,
      eventType: "archive.run",
      aggregateType: "ARCHIVE_JOB",
      aggregateId: created!.id,
      payload: { archiveJobId: created!.id },
      idempotencyKey: `archive.run:${created!.id}`,
      correlationId: crypto.randomUUID(),
    });
    await audit(
      tx as never,
      actor,
      "project.archive_queued",
      "ARCHIVE_JOB",
      created!.id,
      null,
      {
        projectId,
        destinationPrefix,
        managerOverride: destinationPrefix !== defaultDestination,
      },
      destinationReason || undefined,
    );
    return created!;
  });
  revalidatePath("/commercial");
}

export async function closeProject(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId"),
    { db } = createDatabase();
  const project = await scopedProject(db, actor, projectId);
  if (project.status !== "READY_FOR_FINAL_CLOSURE")
    throw new Error("Project is not ready for final closure");
  const [missing] = await db
    .select({ id: projectClosureChecklistItems.id })
    .from(projectClosureChecklistItems)
    .where(
      and(
        eq(projectClosureChecklistItems.projectId, projectId),
        eq(projectClosureChecklistItems.required, true),
        isNull(projectClosureChecklistItems.completedAt),
      ),
    )
    .limit(1);
  const checklist = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectClosureChecklistItems)
    .where(
      and(
        eq(projectClosureChecklistItems.projectId, projectId),
        eq(projectClosureChecklistItems.required, true),
      ),
    );
  if (!checklist[0]?.count || missing)
    throw new Error("Complete every required closure checklist item");
  const [archive] = await db
    .select()
    .from(archiveJobs)
    .where(
      and(
        eq(archiveJobs.projectId, projectId),
        eq(archiveJobs.organizationId, actor.organizationId),
      ),
    )
    .orderBy(sql`${archiveJobs.createdAt} desc`)
    .limit(1);
  if (!archive || archive.status !== "SUCCEEDED")
    throw new Error("A checksum-verified archive must succeed before closure");
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.status, "READY_FOR_FINAL_CLOSURE"),
        ),
      );
    await tx.insert(projectClosureEvents).values({
      organizationId: actor.organizationId,
      projectId,
      actorMembershipId: actor.membershipId,
      action: "CLOSED",
      snapshot: { archiveJobId: archive.id },
    });
    await audit(
      tx as never,
      actor,
      "project.closed",
      "PROJECT",
      projectId,
      { status: project.status },
      { status: "COMPLETED", archiveJobId: archive.id },
    );
  });
  revalidatePath("/commercial");
  revalidatePath(`/projects/${projectId}`);
}

export async function reopenProject(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId"),
    reason = required(form, "reason");
  if (reason.length < 3)
    throw new Error("A meaningful reopen reason is required");
  const { db } = createDatabase();
  const project = await scopedProject(db, actor, projectId);
  if (project.status !== "COMPLETED")
    throw new Error("Only completed projects can be reopened");
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        status: "REOPENED",
        reopenedAt: new Date(),
        reopenReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
    await tx.insert(projectClosureEvents).values({
      organizationId: actor.organizationId,
      projectId,
      actorMembershipId: actor.membershipId,
      action: "REOPENED",
      reason,
      snapshot: { priorCompletedAt: project.completedAt },
    });
    await audit(
      tx as never,
      actor,
      "project.reopened",
      "PROJECT",
      projectId,
      { status: "COMPLETED", completedAt: project.completedAt },
      { status: "REOPENED" },
      reason,
    );
  });
  revalidatePath("/commercial");
  revalidatePath(`/projects/${projectId}`);
}

export async function saveRetrospective(form: FormData) {
  const actor = await managerOrThrow(),
    projectId = required(form, "projectId"),
    { db } = createDatabase();
  const project = await scopedProject(db, actor, projectId);
  if (project.status !== "COMPLETED")
    throw new Error("Close the project before recording its retrospective");
  const [[taskSummary], [timeSummary], [versionSummary], [feedbackSummary]] =
    await Promise.all([
      db
        .select({
          estimate: sql<number>`coalesce(sum(${tasks.estimatedMinutes}), 0)::int`,
          tasks: sql<number>`count(*)::int`,
          late: sql<number>`count(*) filter (where ${tasks.completedAt} > ${tasks.dueAt})::int`,
        })
        .from(tasks)
        .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
        .where(
          and(
            eq(deliverables.projectId, projectId),
            eq(tasks.organizationId, actor.organizationId),
          ),
        ),
      db
        .select({
          actual: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int`,
        })
        .from(timeEntries)
        .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
        .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
        .where(
          and(
            eq(deliverables.projectId, projectId),
            eq(timeEntries.organizationId, actor.organizationId),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(fileVersions)
        .innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId))
        .innerJoin(tasks, eq(tasks.id, fileAssets.taskId))
        .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
        .where(
          and(
            eq(deliverables.projectId, projectId),
            eq(fileVersions.organizationId, actor.organizationId),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewComments)
        .innerJoin(
          reviewShares,
          eq(reviewShares.id, reviewComments.reviewShareId),
        )
        .innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId))
        .innerJoin(tasks, eq(tasks.id, reviewHubs.taskId))
        .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
        .where(
          and(
            eq(deliverables.projectId, projectId),
            eq(reviewComments.organizationId, actor.organizationId),
          ),
        ),
    ]);
  const lessons = field(form, "lessons")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const revisionSummary = {
    fileVersionCount: versionSummary?.count ?? 0,
    feedbackCommentCount: feedbackSummary?.count ?? 0,
  };
  const [retro] = await db
    .insert(projectRetrospectives)
    .values({
      organizationId: actor.organizationId,
      projectId,
      estimateMinutes: taskSummary?.estimate ?? 0,
      actualMinutes: timeSummary?.actual ?? 0,
      deadlineSummary: {
        taskCount: taskSummary?.tasks ?? 0,
        lateTaskCount: taskSummary?.late ?? 0,
      },
      revisionSummary,
      bottleneckSummary: field(form, "bottleneckSummary"),
      lessons,
      createdByMembershipId: actor.membershipId,
      approvedAt: new Date(),
      approvedByMembershipId: actor.membershipId,
    })
    .onConflictDoUpdate({
      target: projectRetrospectives.projectId,
      set: {
        estimateMinutes: taskSummary?.estimate ?? 0,
        actualMinutes: timeSummary?.actual ?? 0,
        deadlineSummary: {
          taskCount: taskSummary?.tasks ?? 0,
          lateTaskCount: taskSummary?.late ?? 0,
        },
        revisionSummary,
        bottleneckSummary: field(form, "bottleneckSummary"),
        lessons,
        approvedAt: new Date(),
        approvedByMembershipId: actor.membershipId,
        updatedAt: new Date(),
      },
    })
    .returning({ id: projectRetrospectives.id });
  const suggestion = field(form, "templateSuggestion");
  if (suggestion)
    await db.insert(templateImprovementSuggestions).values({
      organizationId: actor.organizationId,
      retrospectiveId: retro!.id,
      suggestion,
    });
  revalidatePath("/commercial");
}

export async function decideTemplateSuggestion(form: FormData) {
  const actor = await managerOrThrow(),
    suggestionId = required(form, "suggestionId"),
    decision = required(form, "decision"),
    reason = required(form, "reason");
  if (!["APPROVED", "REJECTED"].includes(decision) || reason.length < 3)
    throw new Error("A valid decision and reason are required");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(templateImprovementSuggestions)
      .set({
        status: decision,
        decidedAt: new Date(),
        decidedByMembershipId: actor.membershipId,
        decisionReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(templateImprovementSuggestions.id, suggestionId),
          eq(
            templateImprovementSuggestions.organizationId,
            actor.organizationId,
          ),
          eq(templateImprovementSuggestions.status, "PROPOSED"),
        ),
      )
      .returning({ id: templateImprovementSuggestions.id });
    if (!changed) throw new Error("Open template suggestion not found");
    await audit(
      tx as never,
      actor,
      "template.suggestion_decided",
      "TEMPLATE_SUGGESTION",
      suggestionId,
      { status: "PROPOSED" },
      { status: decision },
      reason,
    );
  });
  revalidatePath("/commercial");
}
