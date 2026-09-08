import { AppShell } from "../../components/app-shell";
import { resolveActorContext } from "../../lib/actor-context";
import { and, createDatabase, eq, isNull, notifications } from "@andthenn/db";
import { isOperationalLeader } from "@andthenn/domain";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getManagerNavigationCounts } from "../../lib/manager-overview";

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
  const { db } = createDatabase();
  const [navCounts, unreadRows] = await Promise.all([
    isOperationalLeader(actor.role) ? getManagerNavigationCounts(actor.organizationId) : Promise.resolve(undefined),
    db.select({ id: notifications.id }).from(notifications).where(and(
      eq(notifications.organizationId, actor.organizationId),
      eq(notifications.recipientMembershipId, actor.membershipId),
      isNull(notifications.readAt),
    )),
  ]);
  return <AppShell actor={{ displayName: actor.displayName, role: actor.role, accountType: actor.accountType, financeAccess: actor.financeAccess }} navCounts={navCounts} unreadCount={unreadRows.length}>{children}</AppShell>;
}
