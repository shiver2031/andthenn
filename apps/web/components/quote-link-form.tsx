"use client";

import { Button } from "@andthenn/ui";
import { Copy, Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { createQuoteAcceptanceLink } from "../app/(erp)/commercial/actions";

export function QuoteLinkForm({ quoteVersionId }: { quoteVersionId: string }) {
  const [url, setUrl] = useState(""),
    [message, setMessage] = useState(""),
    [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      try {
        const result = await createQuoteAcceptanceLink(new FormData(form));
        setUrl(result.url);
        setMessage("Secure acceptance link created.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to create acceptance link",
        );
      }
    });
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-xl bg-zinc-50 p-3">
      <input type="hidden" name="quoteVersionId" value={quoteVersionId} />
      <label className="text-xs font-semibold text-zinc-500">
        Acceptance link expiry
        <input
          name="expiresAt"
          type="datetime-local"
          className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3"
        />
      </label>
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        className="mt-2 min-h-11"
      >
        <Link2 size={15} />
        {pending ? "Creating…" : "Create acceptance link"}
      </Button>
      {url && (
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 p-2">
          <input
            readOnly
            value={url}
            aria-label="Acceptance URL"
            className="min-w-0 flex-1 bg-transparent text-xs"
          />
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(url)}
            aria-label="Copy acceptance link"
            className="grid size-11 place-items-center rounded-xl bg-white"
          >
            <Copy size={15} />
          </button>
        </div>
      )}
      {message && (
        <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  );
}
