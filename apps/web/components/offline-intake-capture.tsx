"use client";

import { Button } from "@andthenn/ui";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type Draft = { id: string; title: string; summary: string; capturedAt: string; cipher: ArrayBuffer; iv: Uint8Array };
const dbName = "andthenn-intake-drafts"; const keyName = "andthenn-intake-session-key";

function openStore() { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(dbName, 1); request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) { return openStore().then((db) => new Promise<T>((resolve, reject) => { const request = work(db.transaction("drafts", mode).objectStore("drafts")); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); })); }
async function sessionKey() {
  const encoded = sessionStorage.getItem(keyName);
  if (encoded) return crypto.subtle.importKey("jwk", JSON.parse(encoded), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  // Any stale encrypted drafts are unreadable after logout/new session and must be removed.
  indexedDB.deleteDatabase(dbName);
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  sessionStorage.setItem(keyName, JSON.stringify(await crypto.subtle.exportKey("jwk", key))); return key;
}

export function OfflineIntakeCapture() {
  const [online, setOnline] = useState(true); const [queued, setQueued] = useState(0); const [status, setStatus] = useState("");
  const refresh = async () => { try { const all = await transaction<Draft[]>("readonly", (store) => store.getAll()); setQueued(all.length); } catch { setQueued(0); } };
  useEffect(() => { setOnline(navigator.onLine); void sessionKey().then(refresh); const on = () => { setOnline(true); void sync(); }; const off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);
  const queue = async (form: FormData) => { const title = String(form.get("offline-title") ?? "").trim(), summary = String(form.get("offline-summary") ?? "").trim(); if (!summary) { setStatus("Add a request summary before saving."); return; } const key = await sessionKey(), iv = crypto.getRandomValues(new Uint8Array(12)), capturedAt = new Date().toISOString(); const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify({ title, summary, capturedAt }))); await transaction("readwrite", (store) => store.put({ id: crypto.randomUUID(), title, summary, capturedAt, cipher, iv } satisfies Draft)); setStatus("Saved securely on this device. It will clear when this browser session ends."); await refresh(); };
  const sync = async () => { if (!navigator.onLine) return; const drafts = await transaction<Draft[]>("readonly", (store) => store.getAll()); if (!drafts.length) return; const key = await sessionKey(); let sent = 0; for (const draft of drafts) { try { const iv = new Uint8Array(draft.iv).buffer as ArrayBuffer; const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, draft.cipher); const payload = JSON.parse(new TextDecoder().decode(decrypted)) as Omit<Draft, "id" | "cipher" | "iv">; const response = await fetch("/api/intake/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error("sync failed"); await transaction("readwrite", (store) => store.delete(draft.id)); sent++; } catch { setStatus("Some drafts could not sync; they remain encrypted on this device."); } } await refresh(); if (sent) { setStatus(`${sent} draft${sent === 1 ? "" : "s"} synced.`); window.location.reload(); } };
  return <details className="surface mb-5 rounded-2xl p-4"><summary className="cursor-pointer text-sm font-bold">Offline quick capture {queued ? `(${queued} queued)` : ""}</summary><form action={queue} className="mt-4 grid gap-2 md:grid-cols-[1fr_2fr_auto]"><label className="sr-only" htmlFor="offline-title">Request title</label><input id="offline-title" name="offline-title" maxLength={300} placeholder="Request title" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"/><label className="sr-only" htmlFor="offline-summary">Request summary</label><input id="offline-summary" name="offline-summary" required maxLength={10000} placeholder="Capture now; sync when connected" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"/><Button type="submit" variant="secondary"><CloudOff size={16}/> Save offline</Button></form><div className="mt-3 flex items-center gap-3 text-xs text-zinc-500"><span>{online ? "Connected" : "Offline"}</span><button type="button" onClick={() => void sync()} disabled={!online || !queued} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-violet-700 disabled:opacity-50"><RefreshCw size={14}/> Sync queued drafts</button>{status && <span aria-live="polite">{status}</span>}</div></details>;
}
