import { and, createDatabase, desc, eq, notifications } from "@andthenn/db";
import { PageHeading } from "../../../components/page-heading";
import { markAllNotificationsRead, markNotificationRead } from "../operations/actions";
import { resolveActorContext } from "../../../lib/actor-context";

export default async function NotificationsPage() {
  const actor = await resolveActorContext(); if (!actor) return null; const { db } = createDatabase();
  const rows = await db.select().from(notifications).where(and(eq(notifications.organizationId, actor.organizationId), eq(notifications.recipientMembershipId, actor.membershipId))).orderBy(desc(notifications.createdAt)).limit(100);
  const unread = rows.filter((row) => !row.readAt).length;
  return <><PageHeading eyebrow={`${unread} unread`} title="Notifications" description="Persistent event notifications for work you can access." action={<form action={markAllNotificationsRead}><button className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold">Mark all read</button></form>}/>
    <div className="surface max-w-3xl overflow-hidden rounded-2xl">{rows.map((note) => <article key={note.id} className={`flex gap-4 border-b border-zinc-100 p-5 ${!note.readAt ? "bg-violet-50/40" : ""}`}><div className="flex-1"><h2 className="text-sm font-bold">{note.title}</h2><p className="mt-1 text-xs text-zinc-500">{note.body}</p><time className="mt-2 block text-[10px] text-zinc-400">{note.createdAt.toLocaleString()}</time></div>{!note.readAt && <form action={markNotificationRead}><input type="hidden" name="notificationId" value={note.id}/><button className="text-xs font-bold text-violet-600">Mark read</button></form>}</article>)}{!rows.length && <p className="p-6 text-sm text-zinc-500">You are all caught up.</p>}</div></>;
}
