import { AppShell } from "../../components/app-shell";
import { resolveActorContext } from "../../lib/actor-context";
import { and, createDatabase, eq, isNull, notifications, sql } from "@andthenn/db";
import { isOperationalLeader } from "@andthenn/domain";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getManagerNavigationCounts } from "../../lib/manager-overview";
import { Suspense } from "react";

// Authentication and membership must be evaluated for every request; this also
// keeps production configuration validation out of build-time prerendering.
export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const actor = await resolveActorContext();
  if (!actor) redirect("/login");
  const pathname = (await headers()).get("x-andthenn-pathname") ?? "/home";
  const prefixAllowed = (prefixes: string[]) => prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const common = ["/home", "/projects", "/notifications", "/files"];
  const allowed = actor.role === "FOUNDER"
    || (actor.role === "MANAGER" && prefixAllowed([...common, "/work", "/tasks", "/clients", "/team", "/intake", "/proposals", "/workload", "/reports", "/search", "/admin", ...(actor.financeAccess ? ["/accounts", "/commercial"] : [])]))
    || (actor.role === "DESIGNER" && prefixAllowed([...common, "/work", "/tasks", "/search"]))
    || (actor.role === "CLIENT" && prefixAllowed(common));
  if (!allowed) {
    redirect("/home");
  }
  const navBadge = isOperationalLeader(actor.role)
    ? <Suspense fallback={null}><WorkAttentionBadge organizationId={actor.organizationId}/></Suspense>
    : null;
  const unreadBadge = <Suspense fallback={null}><UnreadBadge organizationId={actor.organizationId} membershipId={actor.membershipId}/></Suspense>;
  return <AppShell actor={{ displayName: actor.displayName, role: actor.role, accountType: actor.accountType, financeAccess: actor.financeAccess }} navBadge={navBadge} unreadBadge={unreadBadge}>{children}</AppShell>;
}

async function WorkAttentionBadge({ organizationId }: { organizationId: string }) {
  const { actionable } = await getManagerNavigationCounts(organizationId);
  return actionable > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-violet-500 px-1.5 py-0.5 text-[10px] text-white">{actionable}</span> : null;
}

async function UnreadBadge({ organizationId, membershipId }: { organizationId: string; membershipId: string }) {
  const { db } = createDatabase();
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(and(
    eq(notifications.organizationId, organizationId),
    eq(notifications.recipientMembershipId, membershipId),
    isNull(notifications.readAt),
  ));
  const count = row?.total ?? 0;
  return count > 0 ? <span aria-label={`${count} unread`} className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-fuchsia-700 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-[#f6f5f1]">{count > 9 ? "9+" : count}</span> : null;
}
