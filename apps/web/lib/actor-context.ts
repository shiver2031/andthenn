import { and, createDatabase, deliverables, eq, inArray, isNull, memberships, profiles, projectMemberships, taskAssignees, tasks } from "@andthenn/db";
import type { AccountType, MembershipContext, Role } from "@andthenn/domain";
import { isMembershipActive } from "@andthenn/domain";
import { assertRuntimeConfiguration, prototypeRuntimeEnabled, reviewRuntimeEnabled } from "./config";
import { prototypePersonaFromCookies, prototypePersonas } from "./prototype";
import { createSupabaseServerClient } from "./supabase/server";

export interface ActorContext extends MembershipContext {
  membershipId: string;
  email: string;
  displayName: string;
  sessionIssuedAt: Date | null;
}

function jwtIssuedAt(token: string | undefined): Date | null {
  if (!token) return null;
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as { iat?: number };
    return payload.iat ? new Date(payload.iat * 1_000) : null;
  } catch { return null; }
}

/** Resolves the single authoritative application identity for an internal request. */
export async function resolveActorContext(): Promise<ActorContext | null> {
  assertRuntimeConfiguration();
  // Hosted review uses the same signed personas as the local prototype, but
  // resolves them against its deployed seeded database.
  if (prototypeRuntimeEnabled() || reviewRuntimeEnabled()) {
    const persona = await prototypePersonaFromCookies();
    if (!persona) return null;
    const userId = prototypePersonas[persona].authUserId;
    return resolveDatabaseActor(userId, new Date());
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [{ data: { user }, error }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(), supabase.auth.getSession(),
  ]);
  if (error || !user) return null;

  return resolveDatabaseActor(user.id, jwtIssuedAt(session?.access_token));
}

async function resolveDatabaseActor(userId: string, issuedAt: Date | null): Promise<ActorContext | null> {
  const { db } = createDatabase();
  const members = await db.select({
    id: memberships.id, organizationId: memberships.organizationId, role: memberships.role,
    accountType: memberships.accountType, status: memberships.status, expiresAt: memberships.expiresAt,
    startsAt: memberships.startsAt,
    financeAccess: memberships.financeAccess, sessionRevokedAfter: memberships.sessionRevokedAfter,
    email: profiles.email, displayName: profiles.displayName,
  }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId))
    .where(eq(profiles.authUserId, userId)).limit(2);
  // Multi-organization selection requires an explicit organization switcher;
  // silently choosing the first membership is an authorization error.
  if (members.length !== 1) return null;
  const [member] = members;
  if (!member) return null;

  const visibleProjectIds = new Set<string>();
  const primaryTaskIds = new Set<string>();
  const collaboratorTaskIds = new Set<string>();
  const reviewShareTaskIds = new Set<string>();
  const context: ActorContext = {
    membershipId: member.id, userId, organizationId: member.organizationId,
    role: member.role as Role, accountType: member.accountType as AccountType,
    status: member.status, expiresAt: member.expiresAt, financeAccess: member.financeAccess,
    email: member.email, displayName: member.displayName, sessionIssuedAt: issuedAt,
    visibleProjectIds, primaryTaskIds, collaboratorTaskIds, reviewShareTaskIds,
  };
  if (!isMembershipActive(context) || (member.startsAt && member.startsAt > new Date()) || (member.sessionRevokedAfter && (!issuedAt || issuedAt <= member.sessionRevokedAfter))) return null;

  const [projects, assignments] = await Promise.all([
    db.select({ projectId: projectMemberships.projectId, canShareReviews: projectMemberships.canShareReviews })
      .from(projectMemberships).where(and(eq(projectMemberships.organizationId, member.organizationId), eq(projectMemberships.membershipId, member.id), isNull(projectMemberships.removedAt))),
    db.select({ taskId: taskAssignees.taskId, kind: taskAssignees.kind })
      .from(taskAssignees).where(and(eq(taskAssignees.organizationId, member.organizationId), eq(taskAssignees.membershipId, member.id), isNull(taskAssignees.removedAt))),
  ]);
  for (const project of projects) visibleProjectIds.add(project.projectId);
  const shareProjectIds = projects.filter((project) => project.canShareReviews).map((project) => project.projectId);
  if (shareProjectIds.length) {
    const shareTasks = await db.select({ taskId: tasks.id }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).where(and(eq(tasks.organizationId, member.organizationId), inArray(deliverables.projectId, shareProjectIds)));
    for (const task of shareTasks) reviewShareTaskIds.add(task.taskId);
  }
  for (const assignment of assignments) {
    (assignment.kind === "PRIMARY" ? primaryTaskIds : collaboratorTaskIds).add(assignment.taskId);
  }
  return context;
}
