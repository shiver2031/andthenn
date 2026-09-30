"use client";

import type { Role } from "@andthenn/domain";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Step = { title: string; body: string; selector: string };
type Box = { top: number; left: number; width: number; height: number };

function tourSteps(role: Role): Step[] {
  const firstAction = role === "CLIENT" ? "Open shared files or a project when you are ready to review." : role === "DESIGNER" ? "Open your work queue to see the tasks that need you." : "Open intake to review requests and start the next project.";
  return [
    { title: "Home", body: "Start here for the work that matters to your role today.", selector: "[data-walkthrough='home']" },
    { title: "Navigation", body: "Use the workspace menu to move between your pages. On a small screen, open it with the menu button.", selector: "[data-walkthrough='navigation']" },
    { title: "Your first action", body: firstAction, selector: "[data-walkthrough='first-action']" },
  ];
}

export function LoginWalkthrough({ role, replaySignal }: { role: Role; replaySignal: number }) {
  const router = useRouter();
  const steps = useMemo(() => tourSteps(role), [role]);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const initialFocus = useRef<Element | null>(null);
  const lastReplay = useRef(0);

  const close = useCallback(() => {
    setActive(false); setBox(null); setError("");
    const focus = initialFocus.current;
    if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
    else ([...document.querySelectorAll<HTMLElement>("[data-help-trigger]")].find((item) => item.getClientRects().length > 0) ?? document.querySelector<HTMLElement>("[aria-label='Open navigation']"))?.focus();
  }, []);

  useEffect(() => {
    if (replaySignal <= lastReplay.current) return;
    lastReplay.current = replaySignal;
    initialFocus.current = document.activeElement;
    setIndex(0); setBox(null); setError(""); setActive(true);
    router.push("/home");
  }, [replaySignal, router]);

  useEffect(() => {
    if (!active) return;
    const step = steps[index];
    if (!step) return;
    setBox(null); setError("");
    let cancelled = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (cancelled) return;
      const element = window.location.pathname === "/home" ? document.querySelector(step.selector) : null;
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: "center", behavior: "instant" });
        const rect = element.getBoundingClientRect();
        setBox({ top: Math.max(4, rect.top - 5), left: Math.max(4, rect.left - 5), width: Math.min(window.innerWidth - 8, rect.width + 10), height: Math.min(window.innerHeight - 8, rect.height + 10) });
        window.clearInterval(timer);
        window.setTimeout(() => dialog.current?.focus(), 0);
      } else if (Date.now() - started > 8000) {
        window.clearInterval(timer);
        setError("This part of the tour could not load. Close it and try again from Help.");
      }
    }, 80);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, index, steps]);

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

  if (!active) return null;
  const step = steps[index];
  if (!step) return null;
  return <>
    {box && !error ? <>
      <div aria-hidden="true" className="pointer-events-none fixed left-0 right-0 top-0 z-[90] bg-zinc-950/55" style={{ height: box.top }}/>
      <div aria-hidden="true" className="pointer-events-none fixed left-0 z-[90] bg-zinc-950/55" style={{ top: box.top, width: box.left, height: box.height }}/>
      <div aria-hidden="true" className="pointer-events-none fixed right-0 z-[90] bg-zinc-950/55" style={{ top: box.top, left: box.left + box.width, height: box.height }}/>
      <div aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 right-0 z-[90] bg-zinc-950/55" style={{ top: box.top + box.height }}/>
      <div aria-hidden="true" className="pointer-events-none fixed z-[100] rounded-xl border-[3px] border-violet-400 shadow-[0_0_0_4px_rgba(255,255,255,.9)]" style={box}/>
    </> : <div className="pointer-events-none fixed inset-0 z-[90] bg-zinc-950/55" aria-hidden="true"/>}
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-body" className="fixed bottom-3 left-3 right-3 z-[110] max-h-[55dvh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-2xl outline-none sm:bottom-6 sm:left-auto sm:right-6 sm:w-[420px]">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Quick tour · {index + 1} of {steps.length}</p>
      <h2 id="walkthrough-title" className="mt-2 text-xl font-bold">{step.title}</h2>
      <p id="walkthrough-body" className="mt-2 text-sm leading-6 text-zinc-700">{step.body}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={index === 0 || Boolean(error)} onClick={() => setIndex(index - 1)} className="min-h-11 rounded-xl border border-zinc-200 px-4 text-sm font-semibold disabled:opacity-40">Back</button>
        {!error && <button type="button" disabled={!box} onClick={() => index === steps.length - 1 ? close() : setIndex(index + 1)} className="min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{index === steps.length - 1 ? "Finish" : "Next"}</button>}
        <button type="button" onClick={close} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-600">Close tour</button>
      </div>
    </section>
  </>;
}
