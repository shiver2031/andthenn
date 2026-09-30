"use server";

import { and, createDatabase, eq, internalComments, internalCommentMentions, memberships, profiles, projects, sql } from "@andthenn/db";
import { resolveActorContext } from "../../lib/actor-context";
import { discussionMemberScope } from "../../lib/discussion-scope";
import { isResourceId } from "../../lib/resource-access";

/** Recheck current membership on every refresh, including after access revocation. */
export async function loadTeamChat(projectId?: string) {
  const actor = await resolveActorContext();
  if (!actor || actor.role === "CLIENT") throw new Error("Internal discussion access required.");
  if (projectId && !isResourceId(projectId)) throw new Error("Discussion unavailable.");
  const { db } = createDatabase();
  const availableProjects = await db.select({ id: projects.id, name: projects.name }).from(projects)
    .where(and(eq(projects.organizationId, actor.organizationId), sql`exists (
      select 1 from memberships where memberships.id = ${actor.membershipId}::uuid
      and ${discussionMemberScope(actor.organizationId, sql`projects.id`)}
    )`)).orderBy(projects.name);
  const selectedId = projectId ?? availableProjects[0]?.id;
  if (!selectedId) return { projects: availableProjects, projectId: null, comments: [], members: [] };
  if (!availableProjects.some((project) => project.id === selectedId)) throw new Error("Discussion unavailable. Your project access may have changed.");
  const [comments, members, mentions] = await Promise.all([
    db.select({ id: internalComments.id, body: internalComments.body, createdAt: internalComments.createdAt, author: profiles.displayName })
      .from(internalComments).innerJoin(memberships, eq(memberships.id, internalComments.authorMembershipId))
      .innerJoin(profiles, eq(profiles.id, memberships.profileId))
      .where(and(eq(internalComments.organizationId, actor.organizationId), eq(internalComments.projectId, selectedId)))
      .orderBy(internalComments.createdAt),
    db.select({ id: memberships.id, name: profiles.displayName, role: memberships.role }).from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(discussionMemberScope(actor.organizationId, selectedId)),
    db.select({ commentId: internalCommentMentions.commentId, name: profiles.displayName }).from(internalCommentMentions)
      .innerJoin(internalComments, eq(internalComments.id, internalCommentMentions.commentId))
      .innerJoin(memberships, eq(memberships.id, internalCommentMentions.mentionedMembershipId))
      .innerJoin(profiles, eq(profiles.id, memberships.profileId))
      .where(and(eq(internalComments.organizationId, actor.organizationId), eq(internalComments.projectId, selectedId))),
  ]);
  return { projects: availableProjects, projectId: selectedId, comments: comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString(), mentions: mentions.filter((mention) => mention.commentId === comment.id).map((mention) => mention.name) })), members };
}

