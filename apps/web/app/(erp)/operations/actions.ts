"use server";

import {
  and, auditEvents, calendarSyncRecords, createDatabase, eq, integrationConnections,
  isNull, notifications, outboxEvents, savedViews,
} from "@andthenn/db";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../../lib/actor-context";
import { demoModeEnabled } from "../../../lib/config";

async function actorOrThrow(manager = false) {
  if (demoModeEnabled()) throw new Error("Demo mode is read-only");
  const actor = await resolveActorContext();
  if (!actor) throw new Error("Authentication required");
  if (manager && actor.role !== "MANAGER") throw new Error("Manager permission required");
  return actor;
}

async function audit(actor: Awaited<ReturnType<typeof actorOrThrow>>, action: string, objectType: string, objectId: string, after: unknown) {
  const { db } = createDatabase();
  await db.insert(auditEvents).values({
    organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
    actorSnapshot: `${actor.displayName} <${actor.email}>`, source: "SERVER_ACTION", action,
    objectType, objectId, after: after ?? null, correlationId: crypto.randomUUID(),
  });
}

export async function markNotificationRead(form: FormData) {
  const actor = await actorOrThrow();
  const id = String(form.get("notificationId") ?? "");
  if (!id) throw new Error("Notification is required");
  const { db } = createDatabase();
  const [changed] = await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.id, id), eq(notifications.organizationId, actor.organizationId),
    eq(notifications.recipientMembershipId, actor.membershipId), isNull(notifications.readAt),
  )).returning({ id: notifications.id });
  if (changed) await audit(actor, "notification.read", "NOTIFICATION", id, { readAt: new Date().toISOString() });
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const actor = await actorOrThrow();
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    await tx.update(notifications).set({ readAt: new Date() }).where(and(
      eq(notifications.organizationId, actor.organizationId), eq(notifications.recipientMembershipId, actor.membershipId), isNull(notifications.readAt),
    ));
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: `${actor.displayName} <${actor.email}>`, source: "SERVER_ACTION", action: "notification.all_read", objectType: "NOTIFICATION_INBOX", objectId: actor.membershipId, after: {}, correlationId: crypto.randomUUID() });
  });
  revalidatePath("/notifications");
}

export async function saveOperationalView(form: FormData) {
  const actor = await actorOrThrow();
  const resourceType = String(form.get("resourceType") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const queryText = String(form.get("query") ?? "{}");
  if (!resourceType || !name || name.length > 160) throw new Error("A valid view name and resource are required");
  let query: unknown;
  try { query = JSON.parse(queryText); } catch { throw new Error("View filters must be valid JSON"); }
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new Error("View filters must be an object");
  const { db } = createDatabase();
  const [view] = await db.insert(savedViews).values({ organizationId: actor.organizationId, membershipId: actor.membershipId, resourceType, name, query }).returning({ id: savedViews.id });
  await audit(actor, "saved_view.created", "SAVED_VIEW", view!.id, { resourceType, name, query });
  revalidatePath(`/${resourceType}`);
}

export async function connectGoogleCalendar(form: FormData) {
  const actor = await actorOrThrow(true);
  const externalAccountId = String(form.get("externalAccountId") ?? "").trim();
  if (!externalAccountId) throw new Error("Google Calendar account identifier is required");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const [connection] = await tx.insert(integrationConnections).values({ organizationId: actor.organizationId, provider: "GOOGLE", kind: "CALENDAR", status: "CONNECTED", externalAccountId, config: { direction: "ERP_TO_CALENDAR" }, lastHealthAt: new Date(), lastHealthDetail: "Connected; ERP remains source of truth" }).onConflictDoUpdate({ target: [integrationConnections.organizationId, integrationConnections.kind, integrationConnections.provider], set: { status: "CONNECTED", externalAccountId, config: { direction: "ERP_TO_CALENDAR" }, lastHealthAt: new Date(), lastHealthDetail: "Connected; ERP remains source of truth", updatedAt: new Date() } }).returning({ id: integrationConnections.id });
    await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: `${actor.displayName} <${actor.email}>`, source: "SERVER_ACTION", action: "calendar.connected", objectType: "INTEGRATION_CONNECTION", objectId: connection!.id, after: { provider: "GOOGLE", kind: "CALENDAR", direction: "ERP_TO_CALENDAR" }, correlationId: crypto.randomUUID() });
  });
  revalidatePath("/admin");
}

export async function retryCalendarSync(form: FormData) {
  const actor = await actorOrThrow(true);
  const id = String(form.get("syncId") ?? "");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const [row] = await tx.update(calendarSyncRecords).set({ status: "PENDING", failureDetail: null, updatedAt: new Date() }).where(and(eq(calendarSyncRecords.id, id), eq(calendarSyncRecords.organizationId, actor.organizationId))).returning({ id: calendarSyncRecords.id });
    if (!row) throw new Error("Calendar sync record not found");
    await tx.insert(outboxEvents).values({ organizationId: actor.organizationId, eventType: "calendar.sync", aggregateType: "CALENDAR_SYNC", aggregateId: row.id, payload: { syncId: row.id }, idempotencyKey: `calendar.sync:${row.id}:${Date.now()}`, correlationId: crypto.randomUUID() });
  });
  revalidatePath("/admin");
}
