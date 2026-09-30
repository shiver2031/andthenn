"use client";

import type { Role } from "@andthenn/domain";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { walkthroughSteps, type WalkthroughStep, type WalkthroughTargets } from "../lib/walkthrough-flow";

type State = { optedOut: boolean; resumeStepKey: string | null; targets: WalkthroughTargets };
type Box = { top: number; left: number; width: number; height: number };

async function command(name: "optOut" | "pause" | "complete", stepKey?: string) {
  const response = await fetch("/api/walkthrough", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: name, ...(stepKey ? { stepKey } : {}) }) });
  if (!response.ok) throw new Error("Could not save your walkthrough choice. Please try again.");
}

export function LoginWalkthrough({ role, financeAccess, replaySignal }: { role: Role; financeAccess: boolean; replaySignal: number }) {
  const router = useRouter();
  const [steps, setSteps] = useState<WalkthroughStep[]>([]);
  const [targets, setTargets] = useState<WalkthroughTargets | null>(null);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const initialFocus = useRef<Element | null>(null);
  const consumedLogin = useRef(false);
  const lastReplay = useRef(0);

  const start = useCallback(async (manual: boolean) => {
    setError(null); setNotice(null); setBusy(true);
    try {
      const response = await fetch("/api/walkthrough", { cache: "no-store" });
      if (!response.ok) throw new Error("Walkthrough is unavailable. Please try again later.");
      const state = await response.json() as State;
      if (state.optedOut && !manual) return;
      const ordered = walkthroughSteps(role, financeAccess, state.targets);
      initialFocus.current = document.activeElement;
      setTargets(state.targets);
      setSteps(ordered);
      setIndex(manual ? 0 : Math.max(0, ordered.findIndex((step) => step.key === state.resumeStepKey)));
      setActive(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Walkthrough is unavailable.");
    } finally { setBusy(false); }
  }, [role, financeAccess]);

  useEffect(() => {
    if (consumedLogin.current) return;
    consumedLogin.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("walkthrough") !== "start") return;
    url.searchParams.delete("walkthrough");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void start(false);
  }, [start]);

  useEffect(() => {
    if (replaySignal <= lastReplay.current) return;
    lastReplay.current = replaySignal;
    void start(true);
  }, [replaySignal, start]);

  const close = useCallback(() => {
    setActive(false); setBox(null); setNotice(null); setError(null);
    const focus = initialFocus.current;
    if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
  }, []);

  useEffect(() => {
    if (!active) return;
    const step = steps[index];
    if (!step) return;
    if (step.target && !targets?.[step.target]) {
      setBox(null);
      setNotice(`This part of the CRM flow has no available ${step.title.toLowerCase()} item yet. The walkthrough will resume here on your next login.`);
      void command("pause", step.key).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not save progress."));
      return;
    }
    setNotice(null); setBox(null);
    let cancelled = false;
    const started = Date.now();
    const route = new URL(step.href, window.location.origin);
    const current = new URL(window.location.href);
    // The initial step is already the post-login home page. Its state fetch can
    // finish after a user has begun another navigation; never pull them back to
    // Home in that race. Later steps intentionally navigate when selected.
    if (index === 0 && (current.pathname !== route.pathname || current.search !== route.search)) {
      setActive(false);
      return;
    }
    if (current.pathname !== route.pathname || current.search !== route.search) router.push(step.href as Route);
    const timer = window.setInterval(() => {
      if (cancelled) return;
      const current = new URL(window.location.href);
      const landed = current.pathname === route.pathname && current.search === route.search;
      const element = landed ? document.querySelector(step.selector) : null;
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: "center", behavior: "instant" });
        const rect = element.getBoundingClientRect();
        setBox({ top: Math.max(4, rect.top - 5), left: Math.max(4, rect.left - 5), width: Math.min(window.innerWidth - 8, rect.width + 10), height: Math.min(window.innerHeight - 8, rect.height + 10) });
        window.clearInterval(timer);
        window.setTimeout(() => dialog.current?.focus(), 0);
      } else if (Date.now() - started > 8000) {
        window.clearInterval(timer);
        setError(`The ${step.title} walkthrough target is unavailable. This component needs review before the tour can continue.`);
      }
    }, 80);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, index, router, steps, targets]);

  useEffect(() => {
    if (!active || !box) return;
    const update = () => {
      const element = document.querySelector(steps[index]?.selector ?? "");
      if (!(element instanceof HTMLElement)) return;
      const rect = element.getBoundingClientRect();
      setBox({ top: Math.max(4, rect.top - 5), left: Math.max(4, rect.left - 5), width: Math.min(window.innerWidth - 8, rect.width + 10), height: Math.min(window.innerHeight - 8, rect.height + 10) });
    };
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [active, box, index, steps]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      const first = items[0], last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  async function save(name: "optOut" | "complete") {
    setBusy(true); setError(null);
    try { await command(name); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your choice."); }
    finally { setBusy(false); }
  }

  if (!active) return error ? <p role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl bg-rose-50 p-4 text-sm text-rose-800 shadow-xl">{error}<button onClick={() => setError(null)} className="ml-3 underline">Dismiss</button></p> : null;
  const step = steps[index];
  if (!step) return null;
  return <>
    {box && !notice && !error ? <>
      <div aria-hidden="true" className="pointer-events-none fixed left-0 right-0 top-0 z-[90] bg-zinc-950/55" style={{ height: box.top }}/>
      <div aria-hidden="true" className="pointer-events-none fixed left-0 z-[90] bg-zinc-950/55" style={{ top: box.top, width: box.left, height: box.height }}/>
      <div aria-hidden="true" className="pointer-events-none fixed right-0 z-[90] bg-zinc-950/55" style={{ top: box.top, left: box.left + box.width, height: box.height }}/>
      <div aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 right-0 z-[90] bg-zinc-950/55" style={{ top: box.top + box.height }}/>
      <div aria-hidden="true" className="pointer-events-none fixed z-[90]" style={box}/>
    </> : <div className="pointer-events-none fixed inset-0 z-[90] bg-zinc-950/55" aria-hidden="true"/>}
    {box && !notice && !error && <div aria-hidden="true" className="pointer-events-none fixed z-[100] rounded-xl border-[3px] border-violet-400 shadow-[0_0_0_4px_rgba(255,255,255,.9)]" style={box}/>}
    <section ref={dialog} tabIndex={-1} role="dialog" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-body" className="fixed bottom-3 left-3 right-3 z-[110] max-h-[55dvh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl outline-none sm:bottom-6 sm:left-auto sm:right-6 sm:w-[420px]">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">CRM walkthrough · {index + 1} of {steps.length}</p>
      <h2 id="walkthrough-title" className="mt-2 text-xl font-bold">{step.title}</h2>
      <p id="walkthrough-body" className="mt-2 text-sm leading-6 text-zinc-700">{notice ?? step.body}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={busy || index === 0 || Boolean(notice)} onClick={() => setIndex(index - 1)} className="min-h-11 rounded-xl border border-zinc-200 px-4 text-sm font-semibold disabled:opacity-40">Back</button>
        {!notice && !error && <button type="button" disabled={busy || !box} onClick={() => index === steps.length - 1 ? void save("complete") : setIndex(index + 1)} className="min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{index === steps.length - 1 ? "Finish" : "Next"}</button>}
        <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-600">{notice || error ? "Close" : "Skip this time"}</button>
      </div>
      <button type="button" disabled={busy} onClick={() => void save("optOut")} className="mt-3 min-h-11 text-sm font-semibold text-violet-700 underline underline-offset-2 disabled:opacity-40">Don’t show this again</button>
    </section>
  </>;
}
