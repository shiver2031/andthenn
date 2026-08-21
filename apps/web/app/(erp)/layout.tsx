import { AppShell } from "../../components/app-shell";
import { resolveActorContext } from "../../lib/actor-context";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Authentication and membership must be evaluated for every request; this also
// keeps production configuration validation out of build-time prerendering.
export const dynamic = "force-dynamic";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const actor = await resolveActorContext();
  if (!actor) redirect("/login");
  const pathname = (await headers()).get("x-andthenn-pathname") ?? "/home";
  // Temporary accounts have no global discovery surface. Individual task and
  // project loaders additionally apply assignment/project membership scopes.
  if (actor.accountType === "TEMPORARY" && !["/home", "/projects", "/tasks"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    redirect("/home");
  }
  return <AppShell actor={{ displayName: actor.displayName, role: actor.role, accountType: actor.accountType }}>{children}</AppShell>;
}
