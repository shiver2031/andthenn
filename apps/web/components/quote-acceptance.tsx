"use client";

import { Button } from "@andthenn/ui";
import { CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type QuoteData = {
  linkId: string;
  clientName: string;
  versionNumber: number;
  validUntil: string | null;
  expiresAt: string | null;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  pdfChecksumSha256: string;
  pdfUrl: string;
  lines: Array<{
    position: number;
    description: string;
    quantity: number;
    unitRateMinor: number;
    lineTotalMinor: number;
  }>;
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    minor / 100,
  );

export function QuoteAcceptance({ token }: { token: string }) {
  const [data, setData] = useState<QuoteData | null>(null),
    [error, setError] = useState(""),
    [acceptedAt, setAcceptedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/quote/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as QuoteData & { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Quotation unavailable");
      return;
    }
    setData(body);
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/quote/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        confirmed: form.get("confirmed") === "on",
      }),
    });
    const body = (await response.json()) as {
      error?: string;
      acceptedAt?: string;
    };
    if (!response.ok || !body.acceptedAt)
      setError(body.error ?? "Unable to accept quotation");
    else setAcceptedAt(body.acceptedAt);
    setBusy(false);
  }
  if (error && !data)
    return (
      <main className="grid min-h-screen place-items-center bg-[#090b13] p-6 text-white">
        <div className="max-w-md text-center">
          <FileCheck2 className="mx-auto mb-4 text-zinc-500" />
          <h1 className="text-xl font-bold">Quotation unavailable</h1>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
        </div>
      </main>
    );
  if (!data)
    return (
      <main className="grid min-h-screen place-items-center bg-[#090b13] text-sm text-zinc-400">
        Loading secure quotation…
      </main>
    );
  return (
    <main className="min-h-screen bg-[#090b13] p-4 text-white md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 font-black">
            A
          </span>
          <div>
            <p className="font-bold">AndThenn Media</p>
            <p className="text-xs text-zinc-500">
              Secure quotation · Version {data.versionNumber}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
            <ShieldCheck size={15} /> Version pinned
          </span>
        </header>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.04]">
            <div className="border-b border-white/10 p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-violet-300">
                Prepared for
              </p>
              <h1 className="mt-2 text-3xl font-bold">{data.clientName}</h1>
              <p className="mt-2 text-sm text-zinc-400">
                Valid until {data.validUntil ?? "withdrawn"}
              </p>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {data.lines.map((line) => (
                  <div
                    key={line.position}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-white/[.04] p-4"
                  >
                    <div>
                      <p className="font-semibold">{line.description}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {line.quantity} ×{" "}
                        {money(line.unitRateMinor, data.currency)}
                      </p>
                    </div>
                    <p className="font-bold">
                      {money(line.lineTotalMinor, data.currency)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="ml-auto mt-6 max-w-sm space-y-2 text-sm">
                <p className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span>{money(data.subtotalMinor, data.currency)}</span>
                </p>
                <p className="flex justify-between text-zinc-400">
                  <span>Discount</span>
                  <span>− {money(data.discountMinor, data.currency)}</span>
                </p>
                <p className="flex justify-between text-zinc-400">
                  <span>GST</span>
                  <span>{money(data.taxMinor, data.currency)}</span>
                </p>
                <p className="flex justify-between border-t border-white/10 pt-3 text-xl font-bold">
                  <span>Total</span>
                  <span>{money(data.totalMinor, data.currency)}</span>
                </p>
              </div>
              <a
                href={data.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-white/10 px-4 text-sm font-bold hover:bg-white/15"
              >
                View checksum-tracked PDF
              </a>
              <p className="mt-3 break-all text-[10px] text-zinc-600">
                SHA-256 {data.pdfChecksumSha256}
              </p>
            </div>
          </section>
          <aside className="h-fit rounded-3xl border border-white/10 bg-[#11131d] p-6">
            {acceptedAt ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
                <h2 className="mt-4 text-xl font-bold">Quotation accepted</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Evidence recorded {new Date(acceptedAt).toLocaleString()}.
                </p>
              </div>
            ) : (
              <form onSubmit={accept} className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Accept quotation</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Your identity, timestamp, quotation version and PDF checksum
                    will be preserved as acceptance evidence.
                  </p>
                </div>
                <label className="block text-xs font-bold text-zinc-300">
                  Full name *
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={160}
                    autoComplete="name"
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
                  />
                </label>
                <label className="block text-xs font-bold text-zinc-300">
                  Email *
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={320}
                    autoComplete="email"
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm"
                  />
                </label>
                <label className="flex min-h-11 items-start gap-3 rounded-xl bg-white/5 p-3 text-xs leading-5 text-zinc-300">
                  <input
                    name="confirmed"
                    type="checkbox"
                    required
                    className="mt-1"
                  />{" "}
                  I have reviewed version {data.versionNumber} and explicitly
                  accept this quotation and its terms.
                </label>
                <Button
                  type="submit"
                  disabled={busy}
                  className="min-h-11 w-full"
                >
                  {busy ? "Recording acceptance…" : "Accept quotation"}
                </Button>
                {error && (
                  <p className="text-xs text-rose-400" aria-live="polite">
                    {error}
                  </p>
                )}
                {data.expiresAt && (
                  <p className="text-center text-xs text-zinc-600">
                    Link expires {new Date(data.expiresAt).toLocaleString()}
                  </p>
                )}
              </form>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
