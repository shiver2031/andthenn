import { and, createDatabase, eq, internalComments, internalCommentMentions, memberships, profiles } from "@andthenn/db";
import type { ActorContext } from "../lib/actor-context";
import { discussionMemberScope } from "../lib/discussion-scope";
import { TaskDiscussion } from "./task-discussion";
export async function ProjectDiscussion({ projectId, actor }: { projectId: string; actor: ActorContext }) {
  if (actor.role === "CLIENT") return null;
  const { db } = createDatabase();
  const [comments, members, mentions] = await Promise.all([
    db.select({ id: internalComments.id, body: internalComments.body, createdAt: internalComments.createdAt, author: profiles.displayName }).from(internalComments).innerJoin(memberships, eq(memberships.id, internalComments.authorMembershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(internalComments.projectId, projectId), eq(internalComments.organizationId, actor.organizationId))).orderBy(internalComments.createdAt),
    db.select({ id: memberships.id, name: profiles.displayName, role: memberships.role }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(discussionMemberScope(actor.organizationId, projectId)),
    db.select({ commentId: internalCommentMentions.commentId, name: profiles.displayName }).from(internalCommentMentions).innerJoin(internalComments, eq(internalComments.id, internalCommentMentions.commentId)).innerJoin(memberships, eq(memberships.id, internalCommentMentions.mentionedMembershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(internalComments.projectId, projectId), eq(internalComments.organizationId, actor.organizationId))),
  ]);
  return <div id="discussion"><TaskDiscussion projectId={projectId} comments={comments.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), mentions: mentions.filter((mention) => mention.commentId === row.id).map((mention) => mention.name) }))} members={members} canComment={members.some((member) => member.id === actor.membershipId)}/></div>;
}
