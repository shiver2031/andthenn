"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquareText, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadTeamChat } from "../app/(erp)/chat-actions";
import { TaskDiscussion } from "./task-discussion";

type Chat = Awaited<ReturnType<typeof loadTeamChat>>;

export function TeamChat() {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button aria-label="Open team discussion" title="Team discussion" className="grid size-11 place-items-center rounded-xl text-zinc-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><MessageSquareText size={19}/></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[70] bg-zinc-950/40 backdrop-blur-sm"/>
      <Dialog.Content className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-xl flex-col bg-zinc-50 shadow-2xl focus:outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white p-5">
          <div><Dialog.Title className="display text-xl font-bold">Team discussion</Dialog.Title><Dialog.Description className="mt-1 text-sm text-zinc-600">Chat with your project team. Mention a teammate to notify them.</Dialog.Description></div>
          <Dialog.Close asChild><button aria-label="Close team discussion" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-500"><X size={19}/></button></Dialog.Close>
        </div>
        <ChatContent/>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function ChatContent() {
  const [chat, setChat] = useState<Chat | null>(null);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await loadTeamChat(selected);
      if (current === generation.current) { setChat(result); setError(null); }
    } catch (cause) {
      if (current === generation.current) { setError(cause instanceof Error ? cause.message : "Unable to load discussion. Please retry."); }
    } finally { if (current === generation.current) setLoading(false); }
  }, [selected]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (document.visibilityState === "visible") await refresh();
      if (active) timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); generation.current++; };
  }, [refresh]);
  return <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1"><label htmlFor="team-chat-project" className="text-xs font-bold text-zinc-600">Project</label><select id="team-chat-project" className="control mt-1 bg-white" value={chat?.projectId ?? selected ?? ""} disabled={!chat?.projects.length} onChange={(event) => { generation.current++; setChat(null); setSelected(event.target.value); }}>
        {!chat?.projects.length && <option value="">Choose a project</option>}
        {chat?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></div>
      <button aria-label="Refresh discussion" disabled={loading} onClick={() => void refresh()} className="grid size-11 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-violet-50 disabled:opacity-50"><RefreshCw size={17}/></button>
    </div>
    <p className="mt-2 text-xs text-zinc-500">Messages refresh every 5 seconds while this panel is open.</p>
    {loading && !chat && <p role="status" className="py-6 text-sm text-zinc-600">Loading discussion…</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {chat && !chat.projectId && <p className="py-8 text-sm text-zinc-600">No project discussions are available yet. Join a project or receive a task to start chatting.</p>}
    {chat?.projectId && <TaskDiscussion key={chat.projectId} titleId="chat-discussion-title" projectId={chat.projectId} comments={chat.comments} members={chat.members} canComment onPosted={refresh}/>}
  </div>;
}
