"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <form action="/search" onSubmit={(event) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    if (query.length < 2) return;
    startTransition(() => router.push(`/search?q=${encodeURIComponent(query)}` as Route));
  }} className="surface flex max-w-3xl gap-3 rounded-2xl p-4">
    <label className="min-w-0 flex-1"><span className="sr-only">Search query</span><input name="q" defaultValue={initialQuery} minLength={2} maxLength={120} className="control" placeholder="Search work…"/></label>
    <button disabled={pending} className="min-h-11 px-3 font-bold disabled:opacity-60">{pending ? "Searching…" : "Search"}</button>
  </form>;
}
