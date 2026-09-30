"use client";

import { Filter, Search } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Filters = { q?: string; client?: string; project?: string; type?: string; status?: string };

export function FileFilters({ filters, clients, projects, statuses }: { filters: Filters; clients: Array<[string, string]>; projects: Array<[string, string]>; statuses: Array<[string, string]> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <form action="/files" onSubmit={(event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of values) if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    startTransition(() => router.push(`/files${params.size ? `?${params}` : ""}` as Route));
  }} className="surface mb-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_repeat(4,minmax(130px,auto))_auto]">
    <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Search files</span><Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-zinc-400"/><input name="q" defaultValue={filters.q} placeholder="Search files…" className="control pl-9"/></label>
    <FilterSelect name="client" label="All clients" value={filters.client} options={clients}/>
    <FilterSelect name="project" label="All projects" value={filters.project} options={projects}/>
    <FilterSelect name="type" label="All types" value={filters.type} options={[["video", "Video"], ["image", "Image"], ["pdf", "PDF"], ["other", "Other"]]}/>
    <FilterSelect name="status" label="All statuses" value={filters.status} options={statuses}/>
    <button disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-bold text-white disabled:opacity-60"><Filter size={15}/>{pending ? "Applying…" : "Apply"}</button>
  </form>;
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value: string | undefined; options: Array<[string, string]> }) {
  return <label><span className="sr-only">{label}</span><select name={name} defaultValue={value ?? ""} className="control"><option value="">{label}</option>{options.map(([id, option]) => <option key={id} value={id}>{option}</option>)}</select></label>;
}
