"use client";

import { Button, cn } from "@andthenn/ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell, Building2, ChevronDown, CircleDollarSign, CircleHelp,
  FolderKanban, Gauge, Inbox, LayoutDashboard, Menu, Plus, Search,
  Settings, UsersRound, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const sections: Array<{ label: string; links: Array<{ href: Route; label: string; icon: LucideIcon }> }> = [
  { label: "Work", links: [
    { href: "/home", label: "Home", icon: LayoutDashboard },
    { href: "/intake", label: "Intake", icon: Inbox },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/workload", label: "Workload", icon: UsersRound },
  ] },
  { label: "Business", links: [
    { href: "/clients", label: "Clients", icon: Building2 },
    { href: "/commercial", label: "Commercial", icon: CircleDollarSign },
    { href: "/reports", label: "Reports", icon: Gauge },
  ] },
];

function Brand() {
  return <Link href="/home" className="group flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><span className="contents">
    <span className="grid size-9 place-items-center rounded-[13px] bg-gradient-to-br from-violet-500 via-violet-600 to-cyan-400 text-sm font-black text-white shadow-lg shadow-violet-950/30">A</span>
    <span><span className="display block text-[17px] font-bold tracking-tight text-white">AndThenn</span><span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-zinc-300">Media ERP</span></span>
  </span></Link>;
}

type ShellActor = { displayName: string; role: "MANAGER" | "EMPLOYEE" | "TEMP_FREELANCER"; accountType: "PERMANENT" | "TEMPORARY" };

function Sidebar({ close, actor, navCounts, onHelp, onProfile }: { close?: (() => void) | undefined; actor: ShellActor; navCounts?: { actionable: number } | undefined; onHelp: () => void; onProfile: () => void }) {
  const path = usePathname();
  const visibleSections = actor.accountType === "TEMPORARY"
    ? sections.map((section) => ({ ...section, links: section.links.filter((link) => link.href === "/home" || link.href === "/projects") })).filter((section) => section.links.length)
    : actor.role === "EMPLOYEE"
      ? sections.map((section) => ({ ...section, links: section.links.filter((link) => link.href === "/home" || link.href === "/projects") })).filter((section) => section.links.length)
      : sections;
  return <aside className="flex h-full w-[248px] flex-col bg-[#11121a] px-3 py-4 text-zinc-300">
    <div className="px-2 pb-7"><Brand /></div>
    <nav aria-label="Primary" className="flex-1 space-y-6">
      {visibleSections.map((section) => <div key={section.label}>
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-zinc-300">{section.label}</p>
        <div className="space-y-1">{section.links.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== "/home" && path.startsWith(`${href}/`));
          const badge = label === "Intake" && actor.role === "MANAGER" && navCounts?.actionable ? String(navCounts.actionable) : undefined;
          return <Link {...(close ? { onClick: close } : {})} key={href} href={href} className={cn("relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400", active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[.06] hover:text-white")}>
            <span className="contents">
            {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-violet-400" />}
            <Icon aria-hidden size={17} strokeWidth={active ? 2.3 : 1.8} /> <span className="flex-1">{label}</span>
            {badge && <span className="grid min-w-5 place-items-center rounded-full bg-violet-500 px-1.5 py-0.5 text-[10px] text-white">{badge}</span>}
            </span>
          </Link>;
        })}</div>
      </div>)}
    </nav>
    <div className="space-y-1 border-t border-white/[.07] pt-3">
      {actor.role === "MANAGER" && <Link href="/admin" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[.06] hover:text-white"><Settings size={16} /> Settings</Link>}
      <button onClick={onHelp} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><CircleHelp size={16} /> Help &amp; support</button>
      <button onClick={onProfile} aria-label={`Open profile menu for ${actor.displayName}`} className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl bg-white/[.045] p-2 text-left hover:bg-white/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-[10px] font-bold text-white">{actor.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-zinc-200">{actor.displayName}</span><span className="block text-[10px] text-zinc-300">{actor.role.replace("_", " ")}</span></span><ChevronDown size={14} />
      </button>
    </div>
  </aside>;
}

export function AppShell({ children, actor, navCounts }: { children: React.ReactNode; actor: ShellActor; navCounts?: { actionable: number } | undefined }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const reduced = useReducedMotion();
  const hasGlobalSearch = actor.accountType !== "TEMPORARY";
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (hasGlobalSearch && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [hasGlobalSearch]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setMobileOpen(false); setSearchOpen(false); setNewOpen(false); setHelpOpen(false); setProfileOpen(false); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, []);
  async function logout() { await fetch("/api/prototype/session", { method: "DELETE" }).catch(() => undefined); location.assign("/login"); }
  return <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div className="hidden lg:block"><div className="fixed inset-y-0 left-0"><Sidebar actor={actor} navCounts={navCounts} onHelp={() => setHelpOpen(true)} onProfile={() => setProfileOpen(true)} /></div></div>
    <AnimatePresence>{mobileOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}><motion.div initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} transition={{ duration: reduced ? 0 : .22 }} className="h-full w-[248px]" onClick={(event) => event.stopPropagation()}><Sidebar actor={actor} navCounts={navCounts} close={() => setMobileOpen(false)} onHelp={() => setHelpOpen(true)} onProfile={() => setProfileOpen(true)} /></motion.div></motion.div>}</AnimatePresence>
    <div className="min-w-0">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-zinc-200/80 bg-[#f6f5f1]/90 px-4 backdrop-blur-xl md:px-7">
        <button aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="mr-3 grid size-10 place-items-center rounded-xl hover:bg-zinc-200/60 lg:hidden"><Menu size={20} /></button>
        {hasGlobalSearch ? <button onClick={() => setSearchOpen(true)} className="flex h-10 min-w-0 max-w-lg flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-600 shadow-sm hover:border-zinc-300"><Search className="shrink-0" size={17} /><span className="min-w-0 flex-1 truncate">Search tasks, projects, clients…</span><kbd className="hidden rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-600 sm:block">⌘ K</kbd></button> : <div className="flex-1" />}
        <div className="ml-2 flex shrink-0 items-center gap-1.5 sm:ml-auto sm:pl-4">
          <span className="hidden items-center gap-2 sm:inline-flex"><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-700">Prototype</span>{actor.role === "MANAGER" && <Button onClick={() => setNewOpen(true)} size="sm"><Plus size={15} /> New</Button>}</span>
          <Link aria-label="Notifications" href="/notifications" className="relative grid size-10 place-items-center rounded-xl text-zinc-500 hover:bg-white"><Bell size={18} /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-fuchsia-500 ring-2 ring-[#f6f5f1]" /></Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1600px] p-4 outline-none md:p-7 xl:p-9">{children}</main>
    </div>
    <AnimatePresence>{hasGlobalSearch && searchOpen && <motion.div role="dialog" aria-modal="true" aria-label="Global search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] grid place-items-start bg-zinc-950/35 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
      <motion.div initial={{ y: -12, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, scale: .98 }} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <form action="/search" className="flex items-center gap-3 border-b border-zinc-100 px-5"><Search size={20} className="text-violet-500" /><input autoFocus name="q" minLength={2} aria-label="Search" placeholder="Search all of AndThenn…" className="h-16 flex-1 outline-none" /><button type="submit" className="text-sm font-bold text-violet-600">Search</button><button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}><X size={18} /></button></form>
        <div className="p-5 text-sm text-zinc-500">Search opens a permission-scoped result list. Temporary users only see assigned tasks.</div>
      </motion.div>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{newOpen && <Modal title="Create or capture" close={() => setNewOpen(false)}><p className="text-sm text-zinc-600">Choose a real workflow entry point. New records persist in this local prototype.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/intake">Capture intake</Link><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/projects">Create project</Link><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/clients">Add client</Link><Link onClick={() => setNewOpen(false)} className="rounded-xl border border-zinc-200 p-3 text-sm font-bold hover:border-violet-300 hover:bg-violet-50" href="/commercial">Create quote</Link></div></Modal>}</AnimatePresence>
    <AnimatePresence>{helpOpen && <Modal title="Prototype help" close={() => setHelpOpen(false)}><p className="text-sm leading-6 text-zinc-600">This account-free prototype uses local data and simulated inbox, delivery, storage, and calendar services. Use the Prototype panel in Settings to reset data or inspect simulations.</p><Link className="mt-4 inline-flex min-h-11 items-center font-bold text-violet-700 hover:text-violet-900" href="/admin" onClick={() => setHelpOpen(false)}>Open prototype tools</Link></Modal>}</AnimatePresence>
    <AnimatePresence>{profileOpen && <Modal title={actor.displayName} close={() => setProfileOpen(false)}><p className="text-sm text-zinc-600">{actor.role.replace("_", " ")} · local prototype session</p><button onClick={logout} className="mt-5 min-h-11 rounded-xl bg-zinc-950 px-4 text-sm font-bold text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">Sign out</button></Modal>}</AnimatePresence>
  </div>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/45 p-4 backdrop-blur-sm" onClick={close}><motion.section initial={{ y: 12, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: .98 }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><h2 className="display text-xl font-bold text-zinc-950">{title}</h2><button autoFocus aria-label={`Close ${title}`} onClick={close} className="grid size-11 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><X size={18}/></button></div>{children}</motion.section></motion.div>;
}
