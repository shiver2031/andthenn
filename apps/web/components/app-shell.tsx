"use client";

import { TeamChat } from "./team-chat";
import { Button, cn } from "@andthenn/ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell, BriefcaseBusiness, Building2, ChevronDown, CircleDollarSign, CircleHelp,
  Files, FolderKanban, LayoutDashboard, Menu, Plus, Search,
  Settings, UsersRound, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { AccountType, Role } from "@andthenn/domain";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginWalkthrough } from "./login-walkthrough";

type NavLink = { href: Route; label: string; icon: LucideIcon; badge?: "attention" };

const home: NavLink = { href: "/home", label: "Home", icon: LayoutDashboard };
const navigationByRole: Record<Role, NavLink[]> = {
  FOUNDER: [home, { href: "/work", label: "Work", icon: BriefcaseBusiness, badge: "attention" }, { href: "/clients", label: "Clients", icon: Building2 }, { href: "/team", label: "Team", icon: UsersRound }, { href: "/files", label: "Files", icon: Files }, { href: "/accounts", label: "Accounts", icon: CircleDollarSign }],
  MANAGER: [home, { href: "/work", label: "Work", icon: BriefcaseBusiness, badge: "attention" }, { href: "/clients", label: "Clients", icon: Building2 }, { href: "/team", label: "Team", icon: UsersRound }, { href: "/files", label: "Files", icon: Files }],
  DESIGNER: [home, { href: "/work", label: "My Work", icon: FolderKanban }, { href: "/files", label: "Files", icon: Files }],
  CLIENT: [home, { href: "/projects", label: "My Projects", icon: FolderKanban }, { href: "/files", label: "Files", icon: Files }],
};

function Brand() {
  return <Link href="/home" className="group flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><span className="contents">
    <span className="grid size-9 place-items-center rounded-[13px] bg-gradient-to-br from-violet-500 via-violet-600 to-cyan-400 text-sm font-black text-white shadow-lg shadow-violet-950/30">A</span>
    <span><span className="display block text-[17px] font-bold tracking-tight text-white">AndThenn</span><span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-300">Media ERP</span></span>
  </span></Link>;
}

type ShellActor = { displayName: string; role: Role; accountType: AccountType; financeAccess: boolean };

function Sidebar({ close, actor, navBadge, onHelp, onProfile }: { close?: (() => void) | undefined; actor: ShellActor; navBadge?: React.ReactNode; onHelp: () => void; onProfile: () => void }) {
  const path = usePathname();
  const links = navigationByRole[actor.role];
  return <aside className="flex h-full w-full max-w-[280px] flex-col overflow-x-hidden bg-[#11121a] px-3 py-4 text-zinc-300 lg:w-[248px]">
    <div className="flex items-center justify-between gap-3 px-2 pb-7"><Brand />{close && <button type="button" aria-label="Close navigation" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-xl text-zinc-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><X size={18}/></button>}</div>
    <nav aria-label="Primary" className="flex-1">
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-zinc-300">Workspace</p>
        <div className="space-y-1">{links.map(({ href, label, icon: Icon, badge: badgeKind }) => {
          const active = path === href || (href !== "/home" && path.startsWith(`${href}/`));
          return <Link {...(close ? { onClick: close } : {})} key={href} href={href} className={cn("relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-[background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400", active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[.06] hover:text-white")}>
            <span className="contents">
            {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-violet-400" />}
            <Icon aria-hidden size={17} strokeWidth={active ? 2.3 : 1.8} /> <span className="flex-1">{label}</span>
            {badgeKind === "attention" && navBadge}
            </span>
          </Link>;
        })}</div>
    </nav>
    <div className="space-y-1 border-t border-white/[.07] pt-3">
      {(actor.role === "FOUNDER" || actor.role === "MANAGER") && <Link href="/admin" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[.06] hover:text-white"><Settings size={16} /> Settings</Link>}
      <button onClick={onHelp} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><CircleHelp size={16} /> Help &amp; support</button>
      <button onClick={onProfile} aria-label={`Open profile menu for ${actor.displayName}`} className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl bg-white/[.045] p-2 text-left hover:bg-white/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-[10px] font-bold text-white">{actor.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-zinc-200">{actor.displayName}</span><span className="block text-[10px] text-zinc-300">{actor.role.replace("_", " ")}</span></span><ChevronDown size={14} />
      </button>
    </div>
  </aside>;
}

export function AppShell({ children, actor, navBadge, unreadBadge }: { children: React.ReactNode; actor: ShellActor; navBadge?: React.ReactNode; unreadBadge: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [walkthroughReplay, setWalkthroughReplay] = useState(0);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const hasGlobalSearch = actor.role !== "CLIENT";
  const canCreate = actor.role !== "CLIENT";
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (hasGlobalSearch && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [hasGlobalSearch]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setMobileOpen(false); setSearchOpen(false); setNewOpen(false); setHelpOpen(false); setProfileOpen(false); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, []);
  async function logout() {
    setLoggingOut(true); setLogoutError(null);
    try {
      const demoResponse = await fetch("/api/prototype/session", { method: "DELETE" }).catch(() => null);
      if (!demoResponse?.ok) {
        const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
        const { error } = await createSupabaseBrowserClient().auth.signOut();
        if (error) throw error;
      }
      router.replace("/login");
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
      setLoggingOut(false);
    }
  }
  return <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div className="hidden lg:block"><div className="fixed inset-y-0 left-0"><Sidebar actor={actor} navBadge={navBadge} onHelp={() => setHelpOpen(true)} onProfile={() => setProfileOpen(true)} /></div></div>
    {mobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}><motion.div initial={{ x: -300 }} animate={{ x: 0 }} transition={{ duration: reduced ? 0 : .22 }} className="h-full w-[min(86vw,280px)]" onClick={(event) => event.stopPropagation()}><Sidebar actor={actor} navBadge={navBadge} close={() => setMobileOpen(false)} onHelp={() => setHelpOpen(true)} onProfile={() => setProfileOpen(true)} /></motion.div></motion.div>}
    <div className="min-w-0">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-zinc-200/80 bg-[#f6f5f1]/90 px-4 backdrop-blur-xl md:px-7">
        <button aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="mr-3 grid size-10 place-items-center rounded-xl hover:bg-zinc-200/60 lg:hidden"><Menu size={20} /></button>
        {hasGlobalSearch ? <button onClick={() => setSearchOpen(true)} className="flex h-10 min-w-0 max-w-lg flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-600 shadow-sm hover:border-zinc-300"><Search className="shrink-0" size={17} /><span className="min-w-0 flex-1 truncate">Search tasks, projects, clients…</span><kbd className="hidden rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-600 sm:block">⌘ K</kbd></button> : <div className="flex-1" />}
        <div className="ml-2 flex shrink-0 items-center gap-1.5 sm:ml-auto sm:pl-4">
          <span className="hidden items-center gap-2 sm:inline-flex"><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-800">Prototype</span>{canCreate && <Button onClick={() => setNewOpen(true)} size="sm"><Plus size={15} /> New</Button>}</span>
          {actor.role !== "CLIENT" && <TeamChat/>}
          <Link href="/notifications" className="relative grid size-10 place-items-center rounded-xl text-zinc-600 hover:bg-white"><Bell aria-hidden size={18} /><span className="sr-only">Notifications</span>{unreadBadge}</Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1600px] p-4 outline-none md:p-7 xl:p-9">{children}</main>
    </div>
    <AnimatePresence>{hasGlobalSearch && searchOpen && <motion.div role="dialog" aria-modal="true" aria-label="Global search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] grid place-items-start bg-zinc-950/35 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
      <motion.div initial={{ y: -12, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, scale: .98 }} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <form action="/search" onSubmit={(event) => { event.preventDefault(); const query = new FormData(event.currentTarget).get("q")?.toString().trim(); if (query) { setSearchOpen(false); router.push(`/search?q=${encodeURIComponent(query)}`); } }} className="flex items-center gap-3 border-b border-zinc-100 px-5"><Search size={20} className="text-violet-500" /><input autoFocus name="q" minLength={2} aria-label="Search" placeholder="Search all of AndThenn…" className="h-16 flex-1 outline-none" /><button type="submit" className="text-sm font-bold text-violet-600">Search</button><button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}><X size={18} /></button></form>
        <div className="p-5 text-sm text-zinc-500">Search opens a permission-scoped result list. Temporary users only see assigned tasks.</div>
      </motion.div>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{newOpen && <Modal title="Create work" close={() => setNewOpen(false)}><p className="text-sm text-zinc-600">Start with the next real action; project and client context carry through automatically.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/work?new=task">Assign task</Link>{(actor.role === "FOUNDER" || actor.role === "MANAGER") && <><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/work?view=briefs">Capture brief</Link><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/intake?view=setups">Create project</Link><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/clients">Add client</Link></>}</div></Modal>}</AnimatePresence>
    <AnimatePresence>{helpOpen && <Modal title="Prototype help" close={() => setHelpOpen(false)}><p className="text-sm leading-6 text-zinc-600">This account-free prototype uses local data and simulated inbox, delivery, storage, and calendar services. Use the Prototype panel in Settings to reset data or inspect simulations.</p><button type="button" onClick={() => { setHelpOpen(false); setMobileOpen(false); window.setTimeout(() => setWalkthroughReplay((value) => value + 1), 250); }} className="mt-4 block min-h-11 text-sm font-bold text-violet-700">Start CRM walkthrough</button><Link className="inline-flex min-h-11 items-center font-bold text-violet-700 hover:text-violet-900" href="/admin" onClick={() => setHelpOpen(false)}>Open prototype tools</Link></Modal>}</AnimatePresence>
    <AnimatePresence>{profileOpen && <Modal title={actor.displayName} close={() => setProfileOpen(false)}><p className="text-sm text-zinc-600">{actor.role.replace("_", " ")} · local prototype session</p><button onClick={logout} disabled={loggingOut} className="mt-5 min-h-11 rounded-xl bg-zinc-950 px-4 text-sm font-bold text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60">{loggingOut ? "Signing out…" : "Sign out"}</button>{logoutError && <p role="alert" className="mt-3 text-sm text-rose-700">{logoutError}</p>}</Modal>}</AnimatePresence>
    <LoginWalkthrough role={actor.role} financeAccess={actor.financeAccess} replaySignal={walkthroughReplay}/>
  </div>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/45 p-4 backdrop-blur-sm" onClick={close}><motion.section initial={{ y: 12, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: .98 }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><h2 className="display text-xl font-bold text-zinc-950">{title}</h2><button autoFocus aria-label={`Close ${title}`} onClick={close} className="grid size-11 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><X size={18}/></button></div>{children}</motion.section></motion.div>;
}
