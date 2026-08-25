import { AppShell } from "../../components/app-shell";
import { resolveActorContext } from "../../lib/actor-context";
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
  // Non-manager accounts have no global discovery surface. Individual task and
  // project loaders additionally apply active assignment scopes.
  if (actor.role !== "MANAGER" && !["/home", "/projects", "/tasks", "/notifications"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    redirect("/home");
  }
  const navCounts = actor.role === "MANAGER" ? await getManagerNavigationCounts(actor.organizationId) : undefined;
  return <AppShell actor={{ displayName: actor.displayName, role: actor.role, accountType: actor.accountType }} navCounts={navCounts}>{children}</AppShell>;
}
