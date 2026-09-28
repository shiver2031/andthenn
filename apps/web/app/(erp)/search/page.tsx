import { createDatabase, sql } from "@andthenn/db";
import Link from "next/link";
import { PageHeading } from "../../../components/page-heading";
import { SearchForm } from "../../../components/search-form";
import { resolveActorContext } from "../../../lib/actor-context";
import { resourceCatalog, type CatalogRow } from "../../../lib/resource-catalog";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return null;
  const params = await searchParams, q = (params.q ?? "").trim().slice(0,120), page = Math.min(100000, Math.max(1, Math.floor(Number(params.page) || 1))), limit = 25;
  const { db } = createDatabase();
  const needle = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const results = q.length >= 2 ? await db.execute<CatalogRow>(sql`${resourceCatalog(actor)} select * from catalog where title ilike ${needle} or detail ilike ${needle} order by lower(title),kind,id limit ${limit+1} offset ${(page-1)*limit}`) : [];
  return <><PageHeading title="Search" description="Search authorized clients, briefs, proposals, projects, outputs, tasks, files, comments and teammates."/><SearchForm key={q} initialQuery={q}/><div className="mt-4 max-w-3xl space-y-2">{results.slice(0,limit).map((row) => <Link key={`${row.kind}:${row.id}`} href={{ pathname: row.href.split(/[?#]/)[0]!, query: Object.fromEntries(new URLSearchParams(row.href.split("?")[1]?.split("#")[0])), ...(row.href.includes("#") ? { hash: row.href.split("#")[1] } : {}) }} className="surface block rounded-2xl p-4 hover:bg-violet-50"><strong className="block break-words text-sm">{row.title}</strong><p className="mt-1 line-clamp-2 break-words text-xs text-zinc-600">{row.kind.replaceAll("_", " ")} · {row.detail}</p></Link>)}{q.length >= 2 && !results.length && <p className="p-5 text-sm text-zinc-600">No authorized results match this search.</p>}{q.length > 0 && q.length < 2 && <p className="p-5 text-sm">Enter at least two characters.</p>}</div>{results.length>limit && <Link href={`/search?q=${encodeURIComponent(q)}&page=${page+1}`} className="inline-flex min-h-11 items-center font-bold text-violet-700">Next page</Link>}</>;
}
