"use client";

import { Button } from "@andthenn/ui";
import { AtSign, MessageSquareText, Send } from "lucide-react";
import { useState, useTransition, useRef } from "react";
import { postDiscussion } from "../app/(erp)/discussion-actions";

type Comment = { id: string; body: string; author: string; createdAt: string; mentions: string[] };
type Member = { id: string; name: string; role: string };

export function TaskDiscussion({ taskId, projectId, versions = [], comments, members, canComment, titleId = "discussion-title", onPosted }: { titleId?: string; onPosted?: () => Promise<void>; taskId?: string; projectId?: string; versions?: { id: string; name: string }[]; comments: Comment[]; members: Member[]; canComment: boolean }) {
  const requestId = useRef<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(form: HTMLFormElement) {
    setError(null); setSuccess(null);
    startTransition(async () => {
      try {
        if (!requestId.current) requestId.current = crypto.randomUUID();
        const data = new FormData(form); data.set("requestId", requestId.current);
        await postDiscussion(data);
        requestId.current = "";
        form.reset(); setSuccess("Comment posted.");
        await onPosted?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to post the comment. Your text is still available to retry.");
      }
    });
  }

  return <section className="surface mt-5 rounded-2xl p-5" aria-labelledby={titleId}>
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><MessageSquareText size={18}/></span><div><h2 id={titleId} className="display text-lg font-bold">Internal discussion</h2><p className="mt-1 text-sm text-zinc-500">Context, questions, blockers, and durable teammate mentions stay with this {taskId ? "task" : "project"}.</p></div></div>
    <div className="mt-5 space-y-3">{comments.map((comment) => <article id={`${titleId === "discussion-title" ? "comment" : titleId}-${comment.id}`} key={comment.id} className="rounded-2xl border border-zinc-100 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{comment.author}</strong><time className="text-xs text-zinc-500" dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">{comment.body}</p>{comment.mentions.length > 0 && <p className="mt-3 flex flex-wrap items-center gap-1 text-xs font-semibold text-violet-700"><AtSign size={13}/> Mentioned {comment.mentions.join(", ")}</p>}</article>)}{!comments.length && <p className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">No internal comments yet. Add the first decision or question.</p>}</div>
    {canComment && <form className="mt-5 rounded-2xl bg-zinc-50 p-4" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>{taskId ? <input type="hidden" name="taskId" value={taskId}/> : <input type="hidden" name="projectId" value={projectId}/>}<label className="block text-xs font-bold text-zinc-600">Comment<textarea name="body" required maxLength={10000} rows={3} className="control mt-1.5 resize-y bg-white" placeholder="Share context or tag a teammate with @First Last"/></label><label className="mt-3 block text-xs font-bold text-zinc-600">Reply to<select name="parentCommentId" className="control mt-1"><option value="">New comment</option>{comments.map((comment) => <option key={comment.id} value={comment.id}>{comment.author}: {comment.body.slice(0,70)}</option>)}</select></label>{versions.length > 0 && <label className="mt-3 block text-xs font-bold text-zinc-600">Feedback version<select name="fileVersionId" className="control mt-1"><option value="">General discussion</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>}<fieldset className="mt-3"><legend className="flex items-center gap-1 text-xs font-bold text-zinc-600"><AtSign size={13}/> Notify teammates <span className="font-normal text-zinc-500">optional</span></legend><p className="mt-1 text-xs text-zinc-500">Type @Full Name or a unique @FirstName to notify someone here. For shared names, select the teammate below.</p><div className="mt-2 flex flex-wrap gap-2">{members.map((member) => <label key={member.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:border-violet-300"><input name="mentionMembershipId" type="checkbox" value={member.id}/>{member.name}</label>)}</div></fieldset>{error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{success && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</p>}<div className="mt-3 flex justify-end"><Button type="submit" disabled={pending}><Send size={15}/>{pending ? "Posting…" : "Post comment"}</Button></div></form>}
  </section>;
}
