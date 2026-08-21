"use client";

import { Button } from "@andthenn/ui";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
      if (error) setMessage("This recovery link is invalid or has expired. Request another reset link.");
      else window.location.assign("/home");
    } catch {
      setMessage("Password recovery is not configured.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-8 space-y-3">
    <label className="block text-xs text-zinc-400">New password<input required type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400" /></label>
    <label className="block text-xs text-zinc-400">Confirm new password<input required type="password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400" /></label>
    <Button disabled={busy} size="lg" className="w-full" type="submit"><KeyRound size={16} /> Set new password</Button>
    {message && <p role="status" className="text-center text-xs text-zinc-400">{message}</p>}
  </form>;
}
