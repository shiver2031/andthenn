import { and, createDatabase, desc, eq, notifications, sql } from "@andthenn/db";
import Link from "next/link";
import { PageHeading } from "../../../components/page-heading";
import { markAllNotificationsRead, markNotificationRead } from "../operations/actions";
import { resolveActorContext } from "../../../lib/actor-context";
import { resourceCatalog, type CatalogRow } from "../../../lib/resource-catalog";

export default async function NotificationsPage() {
  const actor = await resolveActorContext(); if (!actor) return null; const { db } = createDatabase();
  const rows = await db.select().from(notifications).where(and(eq(notifications.organizationId, actor.organizationId), eq(notifications.recipientMembershipId, actor.membershipId))).orderBy(desc(notifications.createdAt)).limit(100);
  const ids = rows.map((row) => row.objectId).filter((id): id is string => Boolean(id));
  const destinations = ids.length ? await db.execute<CatalogRow>(sql`${resourceCatalog(actor)} select * from catalog where id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`,`)})`) : [];
  const unread = rows.filter((row) => !row.readAt).length;
  return <><PageHeading eyebrow={`${unread} unread`} title="Notifications" description="Persistent event notifications for work you can access." action={<form action={markAllNotificationsRead}><button className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold">Mark all read</button></form>}/>
    <div className="surface max-w-3xl overflow-hidden rounded-2xl">{rows.map((note) => { const destination = destinations.find((row) => row.id === note.objectId && (row.kind === note.objectType || (note.objectType === "INTAKE" && row.kind === "INTAKE_ITEM"))); const href = destination?.href; return <article key={note.id} className={`flex flex-wrap items-center gap-4 border-b border-zinc-100 p-5 ${!note.readAt ? "bg-violet-50/40" : ""}`}><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">{destination ? note.title : "Work item unavailable"}</h2><p className="mt-1 whitespace-pre-line break-words text-xs text-zinc-500">{destination ? note.body : "Access has changed or this item is no longer available."}</p><time className="mt-2 block text-[10px] text-zinc-400">{note.createdAt.toLocaleString()}</time></div><div className="flex items-center gap-2">{href && <Link href={{ pathname: href.split(/[?#]/)[0]!, query: Object.fromEntries(new URLSearchParams(href.split("?")[1]?.split("#")[0])), hash: href.split("#")[1] }} className="inline-flex min-h-11 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700">Open item</Link>}{!note.readAt && <form action={markNotificationRead}><input type="hidden" name="notificationId" value={note.id}/><button className="min-h-11 rounded-xl px-3 text-xs font-bold text-violet-600">Mark read</button></form>}</div></article>; })}{!rows.length && <p className="p-6 text-sm text-zinc-500">You are all caught up.</p>}</div></>;
}
