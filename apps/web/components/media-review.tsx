"use client";

import { Button, cn } from "@andthenn/ui";
import { CheckCircle2, Download, FileText, MessageSquare, Play, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent, RefObject } from "react";

type ReviewComment = {
  id: string; body: string; parentCommentId: string | null; resolvedAt: string | null; createdAt: string;
  reviewerName: string | null; kind: string | null; timeMs: number | null; page: number | null;
  x: number | null; y: number | null; width: number | null; height: number | null;
};
type ReviewData = {
  id: string; taskName: string; projectName: string; versionNumber: number; filename: string; contentType: string;
  downloadAllowed: boolean; expiresAt: string | null; mediaUrl: string; comments: ReviewComment[];
};
type Session = { id: string; token: string; name: string };
type PendingAnnotation = { kind: "GENERAL" } | { kind: "TIMECODE"; timeMs: number } | { kind: "IMAGE_POINT"; x: number; y: number } | { kind: "IMAGE_REGION"; x: number; y: number; width: number; height: number } | { kind: "PDF_REGION"; page: number; x: number; y: number; width: number; height: number };

export function MediaReview({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null); const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [annotation, setAnnotation] = useState<PendingAnnotation>({ kind: "GENERAL" });
  const [replyTo, setReplyTo] = useState<string | null>(null); const [filter, setFilter] = useState<"ALL" | "OUTSTANDING">("ALL");
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/review/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!response.ok) { setError("This review link is unavailable or has expired."); return; }
      setData(await response.json() as ReviewData);
    } catch { setError("The review could not be loaded. Check your connection and retry."); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/review/${encodeURIComponent(token)}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") || undefined }) });
    const body = await response.json() as { id?: string; token?: string; error?: string };
    if (!response.ok || !body.id || !body.token) { setError(body.error ?? "Unable to start review"); return; }
    setSession({ id: body.id, token: body.token, name: String(form.get("name")) });
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session) return; const form = event.currentTarget; const body = String(new FormData(form).get("body") ?? "").trim(); if (!body) return;
    const response = await fetch(`/api/review/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewerSessionId: session.id, reviewerSessionToken: session.token, body, parentCommentId: replyTo, annotation, idempotencyKey: crypto.randomUUID() }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Unable to add feedback"); return; }
    form.reset(); setAnnotation({ kind: "GENERAL" }); setReplyTo(null); await load();
  }

  function selectImagePoint(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setAnnotation({ kind: "IMAGE_POINT", x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height });
  }

  if (error && !data) return <main className="grid min-h-screen place-items-center bg-[#090b13] p-6 text-white"><div className="max-w-md text-center"><FileText className="mx-auto mb-4 text-zinc-500"/><h1 className="text-xl font-bold">Review unavailable</h1><p className="mt-2 text-sm text-zinc-400">{error}</p><button onClick={() => void load()} className="mt-5 min-h-11 rounded-xl bg-white/10 px-4 text-sm font-bold hover:bg-white/15">Retry review</button></div></main>;
  if (!data || loading) return <main className="grid min-h-screen place-items-center bg-[#090b13] text-sm text-zinc-400" aria-busy="true">Loading secure review…</main>;
  const type = data.contentType.toLowerCase(); const visibleComments = data.comments.filter((item) => filter === "ALL" || !item.resolvedAt);
  return <main className="min-h-screen bg-[#090b13] text-white">
    <header className="flex min-h-16 items-center gap-4 border-b border-white/10 px-4 md:px-6"><span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-xs font-black">A</span><div className="min-w-0"><p className="truncate text-sm font-bold">{data.projectName} · {data.taskName}</p><p className="truncate text-xs text-zinc-500">{data.filename} · Version {data.versionNumber}</p></div>{data.downloadAllowed && <a href={data.mediaUrl} download className="ml-auto grid size-11 place-items-center rounded-xl bg-white/10" aria-label="Download this version"><Download size={18}/></a>}</header>
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="flex min-w-0 items-center justify-center p-4 md:p-8">
        {type.startsWith("video/") && <video ref={mediaRef as RefObject<HTMLVideoElement>} controls src={data.mediaUrl} className="max-h-[78vh] w-full max-w-5xl rounded-xl bg-black"/>}
        {type.startsWith("audio/") && <div className="w-full max-w-3xl rounded-3xl bg-gradient-to-br from-violet-950 to-cyan-950 p-8 text-center"><Play className="mx-auto mb-5 size-12 text-cyan-300"/><p className="mb-6 text-sm text-zinc-300">{data.filename}</p><audio ref={mediaRef as RefObject<HTMLAudioElement>} controls src={data.mediaUrl} className="w-full"/></div>}
        {type.startsWith("image/") && <button type="button" onClick={selectImagePoint} className="relative max-h-[78vh] max-w-full cursor-crosshair overflow-hidden rounded-xl" aria-label="Select a point on the image for feedback"><img src={data.mediaUrl} alt={data.filename} className="max-h-[78vh] max-w-full object-contain"/>{annotation.kind === "IMAGE_POINT" && <span className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-violet-500 font-bold ring-2 ring-white" style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}>+</span>}</button>}
        {type === "application/pdf" && <iframe title={data.filename} src={data.mediaUrl} className="h-[78vh] w-full max-w-5xl rounded-xl bg-white"/>}
        {!type.startsWith("video/") && !type.startsWith("audio/") && !type.startsWith("image/") && type !== "application/pdf" && <a href={data.mediaUrl} className="rounded-2xl bg-white/10 p-8 text-center"><FileText className="mx-auto mb-4"/>Open {data.filename}</a>}
      </section>
      <aside className="flex min-h-[55vh] flex-col border-l border-white/10 bg-[#11131d]"><div className="border-b border-white/10 p-5"><div className="flex items-center justify-between"><h1 className="text-lg font-bold">Feedback</h1><span className="rounded-full bg-white/10 px-2 py-1 text-xs">{data.comments.length}</span></div><select value={filter} onChange={(event) => setFilter(event.target.value as "ALL" | "OUTSTANDING")} aria-label="Filter feedback" className="mt-3 h-11 w-full rounded-xl border border-white/10 bg-[#181b27] px-3 text-xs"><option value="ALL">All feedback</option><option value="OUTSTANDING">Outstanding only</option></select>{data.expiresAt && <p className="mt-2 text-xs text-zinc-500">Link expires {new Date(data.expiresAt).toLocaleString()}</p>}</div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">{visibleComments.map((item) => <article key={item.id} className={cn("rounded-2xl border p-4", item.parentCommentId && "ml-5", item.resolvedAt ? "border-emerald-900/60 bg-emerald-950/20" : "border-white/10 bg-white/[.03]")}><div className="flex items-center gap-2"><span className="text-xs font-bold">{item.reviewerName ?? "Internal reviewer"}</span>{item.resolvedAt && <CheckCircle2 size={14} className="text-emerald-400"/>}<span className="ml-auto text-[10px] text-zinc-600">{new Date(item.createdAt).toLocaleString()}</span></div>{item.kind === "TIMECODE" && <p className="mt-2 text-xs font-bold text-violet-300">At {formatTime(item.timeMs ?? 0)}</p>}{(item.kind === "IMAGE_POINT" || item.kind === "IMAGE_REGION") && <p className="mt-2 text-xs font-bold text-violet-300">Image {item.kind === "IMAGE_POINT" ? "point" : "area"} {Math.round((item.x ?? 0) * 100)}%, {Math.round((item.y ?? 0) * 100)}%</p>}{item.kind === "PDF_REGION" && <p className="mt-2 text-xs font-bold text-violet-300">PDF page {item.page}</p>}<p className="mt-2 text-sm leading-6 text-zinc-300">{item.body}</p>{session && <button type="button" onClick={() => setReplyTo(item.id)} className="mt-2 min-h-11 rounded-xl px-2 text-xs font-bold text-cyan-300">Reply</button>}</article>)}{!visibleComments.length && <p className="py-10 text-center text-sm text-zinc-600">No matching feedback.</p>}</div>
        <div className="border-t border-white/10 p-4">{session ? <form onSubmit={comment} className="space-y-3"><p className="text-xs text-zinc-500">Reviewing as <strong className="text-zinc-300">{session.name}</strong>{replyTo && <button type="button" onClick={() => setReplyTo(null)} className="ml-2 min-h-11 text-cyan-300">Cancel reply</button>}</p><label className="sr-only" htmlFor="review-feedback">Feedback</label><textarea id="review-feedback" name="body" required maxLength={5000} rows={3} className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-violet-400" placeholder={replyTo ? "Write a reply…" : "Add clear, version-pinned feedback…"}/><div className="flex flex-wrap items-center gap-2">{(type.startsWith("video/") || type.startsWith("audio/")) && <button type="button" onClick={() => setAnnotation({ kind: "TIMECODE", timeMs: Math.round((mediaRef.current?.currentTime ?? 0) * 1000) })} className="min-h-11 rounded-xl bg-white/10 px-3 text-xs">Pin current time</button>}{type.startsWith("image/") && annotation.kind === "IMAGE_POINT" && <button type="button" onClick={() => setAnnotation({ kind: "IMAGE_REGION", x: annotation.x, y: annotation.y, width: Math.min(.2, 1 - annotation.x), height: Math.min(.2, 1 - annotation.y) })} className="min-h-11 rounded-xl bg-white/10 px-3 text-xs">Make selected point an area</button>}<span className="text-xs text-violet-300">{annotation.kind === "TIMECODE" ? formatTime(annotation.timeMs) : annotation.kind === "IMAGE_POINT" ? "Image point selected" : annotation.kind === "IMAGE_REGION" ? "Image area selected" : "General comment"}</span><Button type="submit" className="ml-auto min-h-11"><Send size={15}/> Send</Button></div></form> : <form onSubmit={identify} className="space-y-3"><p className="text-sm font-bold">Identify yourself to leave feedback</p><label className="sr-only" htmlFor="reviewer-name">Your name</label><input id="reviewer-name" name="name" required minLength={2} maxLength={120} className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm" placeholder="Your name"/><label className="sr-only" htmlFor="reviewer-email">Email (optional)</label><input id="reviewer-email" name="email" type="email" className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm" placeholder="Email (optional)"/><Button type="submit" className="min-h-11 w-full"><MessageSquare size={15}/> Start review</Button></form>}{error && <p className="mt-3 text-xs text-rose-400" aria-live="polite">{error}</p>}</div>
      </aside>
    </div>
  </main>;
}

function formatTime(timeMs: number) { const seconds = Math.floor(timeMs / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
