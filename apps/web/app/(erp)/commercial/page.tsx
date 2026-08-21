import { Badge, Button } from "@andthenn/ui";
import {
  and,
  archiveJobs,
  clients,
  createDatabase,
  deliverables,
  eq,
  invoiceRecords,
  invoiceRevisions,
  projectClosureChecklistItems,
  projectRetrospectives,
  projects,
  quoteAcceptanceLinks,
  quoteLines,
  quotes,
  quoteVersions,
  rateCards,
  sql,
  templateImprovementSuggestions,
} from "@andthenn/db";
import { can } from "@andthenn/domain";
import {
  Archive,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveActorContext } from "../../../lib/actor-context";
import { QuoteLinkForm } from "../../../components/quote-link-form";
import {
  closeProject,
  confirmDeliverable,
  createProjectQuote,
  decideTemplateSuggestion,
  finalizeQuoteVersion,
  queueProjectArchive,
  reopenDeliverable,
  reopenProject,
  revokeQuoteAcceptanceLink,
  reviseQuoteVersion,
  saveInvoice,
  saveProjectBudget,
  saveRetrospective,
  seedClosureChecklist,
  toggleClosureChecklistItem,
  updateQuoteLine,
} from "./actions";

const money = (minor: number | null, currency: string) =>
  minor === null
    ? "—"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
        minor / 100,
      );
const input = "h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm";

export default async function CommercialPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceStatus?: string }>;
}) {
  const invoiceFilter = (await searchParams).invoiceStatus ?? "ALL";
  const actor = await resolveActorContext();
  if (!actor) return null;
  if (!can(actor, "finances:view", { explicitlyGranted: true })) notFound();
  const { db } = createDatabase();
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      clientId: projects.clientId,
      clientName: clients.name,
      deadline: projects.deadline,
      budgetMinor: projects.budgetMinor,
      currency: projects.currency,
      budgetNotes: projects.budgetNotes,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.organizationId, actor.organizationId))
    .orderBy(projects.deadline);
  const visibleProjects =
    actor.role === "MANAGER"
      ? projectRows
      : projectRows.filter((project) =>
          actor.visibleProjectIds.has(project.id),
        );
  const visibleIds = new Set(visibleProjects.map((project) => project.id));
  const [
    cards,
    allQuotes,
    allVersions,
    allLines,
    allDeliveries,
    allInvoices,
    allLinks,
    allInvoiceRevisions,
    allChecklists,
    allArchives,
    allRetros,
    allSuggestions,
  ] = await Promise.all([
    db
      .select()
      .from(rateCards)
      .where(
        and(
          eq(rateCards.organizationId, actor.organizationId),
          eq(rateCards.lifecycle, "ACTIVE"),
        ),
      )
      .orderBy(rateCards.name),
    db
      .select()
      .from(quotes)
      .where(eq(quotes.organizationId, actor.organizationId))
      .orderBy(sql`${quotes.createdAt} desc`),
    db
      .select()
      .from(quoteVersions)
      .where(eq(quoteVersions.organizationId, actor.organizationId))
      .orderBy(sql`${quoteVersions.createdAt} desc`),
    db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.organizationId, actor.organizationId))
      .orderBy(quoteLines.position),
    db
      .select()
      .from(deliverables)
      .where(eq(deliverables.organizationId, actor.organizationId))
      .orderBy(deliverables.dueAt),
    db
      .select()
      .from(invoiceRecords)
      .where(eq(invoiceRecords.organizationId, actor.organizationId)),
    db
      .select()
      .from(quoteAcceptanceLinks)
      .where(eq(quoteAcceptanceLinks.organizationId, actor.organizationId))
      .orderBy(sql`${quoteAcceptanceLinks.createdAt} desc`),
    db
      .select()
      .from(invoiceRevisions)
      .where(eq(invoiceRevisions.organizationId, actor.organizationId))
      .orderBy(sql`${invoiceRevisions.createdAt} desc`),
    db
      .select()
      .from(projectClosureChecklistItems)
      .where(
        eq(projectClosureChecklistItems.organizationId, actor.organizationId),
      )
      .orderBy(projectClosureChecklistItems.createdAt),
    db
      .select()
      .from(archiveJobs)
      .where(eq(archiveJobs.organizationId, actor.organizationId))
      .orderBy(sql`${archiveJobs.createdAt} desc`),
    db
      .select()
      .from(projectRetrospectives)
      .where(eq(projectRetrospectives.organizationId, actor.organizationId)),
    db
      .select()
      .from(templateImprovementSuggestions)
      .where(
        eq(templateImprovementSuggestions.organizationId, actor.organizationId),
      )
      .orderBy(sql`${templateImprovementSuggestions.createdAt} desc`),
  ]);
  const quoteRows = allQuotes.filter(
    (quote) => quote.projectId && visibleIds.has(quote.projectId),
  );
  const quoteIds = new Set(quoteRows.map((quote) => quote.id));
  const versions = allVersions.filter((version) =>
    quoteIds.has(version.quoteId),
  );
  const versionIds = new Set(versions.map((version) => version.id));
  const displayProjects =
    invoiceFilter === "ALL"
      ? visibleProjects
      : visibleProjects.filter(
          (project) =>
            (allInvoices.find((invoice) => invoice.projectId === project.id)
              ?.status ?? "NOT_RAISED") === invoiceFilter,
        );
  const accepted = allLinks.filter(
    (link) => versionIds.has(link.quoteVersionId) && link.status === "ACCEPTED",
  ).length;
  const openInvoice = allInvoices
    .filter(
      (invoice) =>
        visibleIds.has(invoice.projectId) &&
        invoice.status !== "PAID" &&
        invoice.status !== "CANCELLED",
    )
    .reduce((sum, invoice) => sum + (invoice.amountMinor ?? 0), 0);
  const currency = visibleProjects[0]?.currency ?? "INR";
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-500">
            Phase 5
          </p>
          <h1 className="display mt-1 text-3xl font-bold">
            Commercials and closure
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Versioned quotations, acceptance evidence, invoices and
            checksum-gated project closure.
          </p>
        </div>
        <Badge tone="green">
          <ShieldCheck size={14} /> Finance scoped
        </Badge>
      </div>
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="surface rounded-2xl p-4">
          <CircleDollarSign className="text-violet-500" size={19} />
          <p className="mt-3 text-xs text-zinc-400">Open invoice value</p>
          <p className="display mt-1 text-2xl font-bold">
            {money(openInvoice, currency)}
          </p>
        </div>
        <div className="surface rounded-2xl p-4">
          <FileCheck2 className="text-cyan-500" size={19} />
          <p className="mt-3 text-xs text-zinc-400">Quote versions</p>
          <p className="display mt-1 text-2xl font-bold">{versions.length}</p>
        </div>
        <div className="surface rounded-2xl p-4">
          <CheckCircle2 className="text-emerald-500" size={19} />
          <p className="mt-3 text-xs text-zinc-400">Accepted links</p>
          <p className="display mt-1 text-2xl font-bold">{accepted}</p>
        </div>
      </section>
      <nav
        aria-label="Invoice status filters"
        className="mb-5 flex flex-wrap gap-2"
      >
        {[
          "ALL",
          "NOT_RAISED",
          "DRAFT",
          "SENT",
          "PARTIALLY_PAID",
          "PAID",
          "OVERDUE",
          "CANCELLED",
        ].map((status) => (
          <Link
            key={status}
            href={
              status === "ALL"
                ? "/commercial"
                : `/commercial?invoiceStatus=${status}`
            }
            className={`min-h-11 rounded-xl px-3 py-3 text-xs font-bold ${invoiceFilter === status ? "bg-violet-600 text-white" : "surface text-zinc-500"}`}
          >
            {status.replaceAll("_", " ")}
          </Link>
        ))}
      </nav>
      <div className="space-y-5">
        {displayProjects.map((project) => {
          const projectQuotes = quoteRows.filter(
              (quote) => quote.projectId === project.id,
            ),
            projectDeliveries = allDeliveries.filter(
              (delivery) => delivery.projectId === project.id,
            ),
            invoice = allInvoices.find((item) => item.projectId === project.id),
            invoiceHistory = invoice
              ? allInvoiceRevisions.filter(
                  (item) => item.invoiceRecordId === invoice.id,
                )
              : [],
            checklist = allChecklists.filter(
              (item) => item.projectId === project.id,
            ),
            archive = allArchives.find((item) => item.projectId === project.id),
            retro = allRetros.find((item) => item.projectId === project.id);
          return (
            <article
              key={project.id}
              className="surface overflow-hidden rounded-2xl"
            >
              <header className="flex flex-wrap items-start gap-3 border-b border-zinc-100 p-5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/projects/${project.id}`}
                    className="display text-xl font-bold hover:text-violet-600"
                  >
                    {project.name}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-400">
                    {project.clientName} · due{" "}
                    {project.deadline.toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  tone={
                    project.status === "COMPLETED"
                      ? "green"
                      : project.status === "READY_FOR_FINAL_CLOSURE"
                        ? "amber"
                        : "cyan"
                  }
                >
                  {project.status.replaceAll("_", " ")}
                </Badge>
              </header>
              <div className="grid gap-5 p-5 xl:grid-cols-3">
                <section>
                  <h2 className="text-sm font-bold">Budget and invoice</h2>
                  {actor.role === "MANAGER" ? (
                    <>
                      <form
                        action={saveProjectBudget}
                        className="mt-3 grid gap-2"
                      >
                        <input
                          type="hidden"
                          name="projectId"
                          value={project.id}
                        />
                        <div className="grid grid-cols-[1fr_90px] gap-2">
                          <input
                            name="budgetMinor"
                            type="number"
                            min="0"
                            step="1"
                            required
                            defaultValue={project.budgetMinor ?? 0}
                            aria-label="Budget in minor units"
                            className={input}
                          />
                          <input
                            name="currency"
                            required
                            pattern="[A-Za-z]{3}"
                            defaultValue={project.currency}
                            aria-label="Currency"
                            className={input}
                          />
                        </div>
                        <textarea
                          name="budgetNotes"
                          defaultValue={project.budgetNotes ?? ""}
                          placeholder="Budget notes"
                          className="min-h-20 rounded-xl border border-zinc-200 p-3 text-sm"
                        />
                        <Button type="submit" size="sm">
                          Save budget
                        </Button>
                      </form>
                      <form
                        action={saveInvoice}
                        className="mt-4 grid gap-2 rounded-xl bg-zinc-50 p-3"
                      >
                        <input
                          type="hidden"
                          name="projectId"
                          value={project.id}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            name="status"
                            defaultValue={invoice?.status ?? "NOT_RAISED"}
                            aria-label="Invoice status"
                            className={input}
                          >
                            {[
                              "NOT_RAISED",
                              "DRAFT",
                              "SENT",
                              "PARTIALLY_PAID",
                              "PAID",
                              "OVERDUE",
                              "CANCELLED",
                            ].map((status) => (
                              <option key={status}>
                                {status.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                          <input
                            name="reference"
                            defaultValue={invoice?.reference ?? ""}
                            placeholder="Reference"
                            className={input}
                          />
                          <input
                            name="amountMinor"
                            type="number"
                            min="0"
                            defaultValue={invoice?.amountMinor ?? ""}
                            placeholder="Amount minor"
                            className={input}
                          />
                          <input
                            name="currency"
                            defaultValue={invoice?.currency ?? project.currency}
                            pattern="[A-Za-z]{3}"
                            required
                            className={input}
                          />
                          <input
                            name="issuedAt"
                            type="date"
                            defaultValue={invoice?.issuedAt ?? ""}
                            aria-label="Issued date"
                            className={input}
                          />
                          <input
                            name="dueAt"
                            type="date"
                            defaultValue={invoice?.dueAt ?? ""}
                            aria-label="Invoice due date"
                            className={input}
                          />
                          <input
                            name="paidAt"
                            type="date"
                            defaultValue={invoice?.paidAt ?? ""}
                            aria-label="Paid date"
                            className={input}
                          />
                          <input
                            name="reason"
                            placeholder="Change reason"
                            className={input}
                          />
                        </div>
                        <Button type="submit" size="sm" variant="secondary">
                          Save invoice
                        </Button>
                      </form>
                      {invoiceHistory.length > 0 && (
                        <details className="mt-2 rounded-xl border border-zinc-100 p-3 text-xs">
                          <summary className="cursor-pointer font-bold">
                            Invoice history · {invoiceHistory.length}
                          </summary>
                          <div className="mt-2 space-y-2">
                            {invoiceHistory.map((revision) => {
                              const after = revision.after as {
                                status?: string;
                                amountMinor?: number | null;
                                reference?: string | null;
                              };
                              return (
                                <p key={revision.id} className="text-zinc-500">
                                  {revision.createdAt.toLocaleString()} ·{" "}
                                  {after.status?.replaceAll("_", " ")} ·{" "}
                                  {money(
                                    after.amountMinor ?? null,
                                    invoice?.currency ?? project.currency,
                                  )}
                                  {after.reference
                                    ? ` · ${after.reference}`
                                    : ""}
                                </p>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    <div className="mt-3 rounded-xl bg-zinc-50 p-4 text-sm">
                      <p className="font-bold">
                        {money(project.budgetMinor, project.currency)} budget
                      </p>
                      <p className="mt-2 text-zinc-500">
                        Invoice:{" "}
                        {invoice?.status.replaceAll("_", " ") ?? "Not raised"}
                      </p>
                    </div>
                  )}
                </section>
                <section>
                  <h2 className="text-sm font-bold">Quotation automation</h2>
                  {actor.role === "MANAGER" && (
                    <form
                      action={createProjectQuote}
                      className="mt-3 grid gap-2 rounded-xl border border-zinc-100 p-3"
                    >
                      <input
                        type="hidden"
                        name="projectId"
                        value={project.id}
                      />
                      <select
                        name="rateCardId"
                        aria-label="Rate card"
                        className={input}
                      >
                        <option value="">No rate card</option>
                        {cards
                          .filter((card) => card.clientId === project.clientId)
                          .map((card) => (
                            <option key={card.id} value={card.id}>
                              {card.name}
                            </option>
                          ))}
                      </select>
                      <input
                        name="validUntil"
                        type="date"
                        required
                        aria-label="Quote valid until"
                        className={input}
                      />
                      <textarea
                        name="notes"
                        placeholder="Quotation notes"
                        className="min-h-16 rounded-xl border border-zinc-200 p-3 text-sm"
                      />
                      <label className="flex min-h-11 items-center gap-2 text-xs">
                        <input name="interstateGst" type="checkbox" />{" "}
                        Interstate GST (IGST)
                      </label>
                      <Button type="submit" size="sm">
                        Generate draft
                      </Button>
                    </form>
                  )}
                  {projectQuotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="mt-3 rounded-xl bg-zinc-50 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            quote.status === "ACCEPTED" ? "green" : "violet"
                          }
                        >
                          {quote.status}
                        </Badge>
                        <span className="text-xs font-bold">
                          {quote.currency}
                        </span>
                      </div>
                      {versions
                        .filter((version) => version.quoteId === quote.id)
                        .map((version) => (
                          <div
                            key={version.id}
                            className="mt-3 border-t border-zinc-200 pt-3"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold">
                                Version {version.versionNumber} ·{" "}
                                {version.status}
                              </p>
                              <p className="text-xs">
                                {money(version.totalMinor, quote.currency)}
                              </p>
                            </div>
                            {allLines
                              .filter(
                                (line) => line.quoteVersionId === version.id,
                              )
                              .map((line) =>
                                actor.role === "MANAGER" &&
                                version.status === "DRAFT" ? (
                                  <form
                                    key={line.id}
                                    action={updateQuoteLine}
                                    className="mt-2 grid gap-1 rounded-lg bg-white p-2"
                                  >
                                    <input
                                      type="hidden"
                                      name="lineId"
                                      value={line.id}
                                    />
                                    <input
                                      name="description"
                                      defaultValue={line.finalDescription}
                                      required
                                      aria-label="Line description"
                                      className={input}
                                    />
                                    <div className="grid grid-cols-2 gap-1">
                                      <input
                                        name="quantity"
                                        type="number"
                                        min="1"
                                        defaultValue={line.quantity}
                                        required
                                        aria-label="Quantity"
                                        className={input}
                                      />
                                      <input
                                        name="unitRateMinor"
                                        type="number"
                                        min="0"
                                        defaultValue={line.unitRateMinor}
                                        required
                                        aria-label="Unit rate minor"
                                        className={input}
                                      />
                                      <input
                                        name="discountBasisPoints"
                                        type="number"
                                        min="0"
                                        max="10000"
                                        defaultValue={line.discountBasisPoints}
                                        required
                                        aria-label="Discount basis points"
                                        className={input}
                                      />
                                      <input
                                        name="taxBasisPoints"
                                        type="number"
                                        min="0"
                                        max="10000"
                                        defaultValue={line.taxBasisPoints}
                                        required
                                        aria-label="Tax basis points"
                                        className={input}
                                      />
                                    </div>
                                    <input
                                      name="overrideReason"
                                      defaultValue={line.overrideReason ?? ""}
                                      placeholder="Override reason"
                                      className={input}
                                    />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant="secondary"
                                    >
                                      Update line
                                    </Button>
                                  </form>
                                ) : (
                                  <p
                                    key={line.id}
                                    className="mt-1 text-xs text-zinc-500"
                                  >
                                    {line.quantity} × {line.finalDescription} ·{" "}
                                    {money(line.lineTotalMinor, quote.currency)}
                                  </p>
                                ),
                              )}
                            {actor.role === "MANAGER" &&
                              version.status === "DRAFT" && (
                                <form
                                  action={finalizeQuoteVersion}
                                  className="mt-2"
                                >
                                  <input
                                    type="hidden"
                                    name="quoteVersionId"
                                    value={version.id}
                                  />
                                  <Button type="submit" size="sm">
                                    Finalize PDF
                                  </Button>
                                </form>
                              )}
                            {actor.role === "MANAGER" &&
                              version.status === "FINAL" && (
                                <>
                                  <QuoteLinkForm quoteVersionId={version.id} />
                                  {allLinks
                                    .filter(
                                      (link) =>
                                        link.quoteVersionId === version.id,
                                    )
                                    .map((link) => (
                                      <div
                                        key={link.id}
                                        className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-bold">
                                            Acceptance {link.status}
                                          </span>
                                          <span className="text-zinc-400">
                                            {link.acceptedAt
                                              ? new Date(
                                                  link.acceptedAt,
                                                ).toLocaleString()
                                              : link.expiresAt
                                                ? `Expires ${link.expiresAt.toLocaleString()}`
                                                : "No expiry"}
                                          </span>
                                        </div>
                                        {link.acceptedName && (
                                          <p className="mt-1 text-zinc-500">
                                            {link.acceptedName} ·{" "}
                                            {link.acceptedEmail}
                                          </p>
                                        )}
                                        {link.status === "ACTIVE" && (
                                          <form
                                            action={revokeQuoteAcceptanceLink}
                                            className="mt-2"
                                          >
                                            <input
                                              type="hidden"
                                              name="linkId"
                                              value={link.id}
                                            />
                                            <Button
                                              type="submit"
                                              size="sm"
                                              variant="secondary"
                                            >
                                              Revoke link
                                            </Button>
                                          </form>
                                        )}
                                      </div>
                                    ))}
                                  <form
                                    action={reviseQuoteVersion}
                                    className="mt-2"
                                  >
                                    <input
                                      type="hidden"
                                      name="quoteVersionId"
                                      value={version.id}
                                    />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant="secondary"
                                    >
                                      <RotateCcw size={14} /> New revision
                                    </Button>
                                  </form>
                                </>
                              )}
                          </div>
                        ))}
                    </div>
                  ))}
                </section>
                <section>
                  <h2 className="text-sm font-bold">Delivery and closure</h2>
                  <div className="mt-3 space-y-2">
                    {projectDeliveries.map((delivery) => (
                      <div
                        key={delivery.id}
                        className="rounded-xl bg-zinc-50 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs font-bold">
                            {delivery.name}
                          </p>
                          <Badge
                            tone={
                              delivery.status === "COMPLETED"
                                ? "green"
                                : "amber"
                            }
                          >
                            {delivery.status.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        {actor.role === "MANAGER" &&
                          delivery.status ===
                            "READY_FOR_MANAGER_CONFIRMATION" && (
                            <form action={confirmDeliverable} className="mt-2">
                              <input
                                type="hidden"
                                name="deliverableId"
                                value={delivery.id}
                              />
                              <Button type="submit" size="sm">
                                Confirm ready
                              </Button>
                            </form>
                          )}
                        {actor.role === "MANAGER" &&
                          delivery.status === "COMPLETED" && (
                            <form
                              action={reopenDeliverable}
                              className="mt-2 flex gap-1"
                            >
                              <input
                                type="hidden"
                                name="deliverableId"
                                value={delivery.id}
                              />
                              <input
                                name="reason"
                                required
                                minLength={3}
                                placeholder="Reopen reason"
                                className={`${input} min-w-0 flex-1`}
                              />
                              <Button
                                type="submit"
                                size="sm"
                                variant="secondary"
                              >
                                Reopen
                              </Button>
                            </form>
                          )}
                      </div>
                    ))}
                  </div>
                  {actor.role === "MANAGER" &&
                    project.status === "READY_FOR_FINAL_CLOSURE" && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-bold text-amber-900">
                          Final closure gate
                        </p>
                        {checklist.length === 0 ? (
                          <form action={seedClosureChecklist} className="mt-2">
                            <input
                              type="hidden"
                              name="projectId"
                              value={project.id}
                            />
                            <Button type="submit" size="sm">
                              Build checklist
                            </Button>
                          </form>
                        ) : (
                          <div className="mt-2 space-y-1">
                            {checklist.map((item) => (
                              <form
                                key={item.id}
                                action={toggleClosureChecklistItem}
                              >
                                <input
                                  type="hidden"
                                  name="itemId"
                                  value={item.id}
                                />
                                <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-white">
                                  <span
                                    className={`size-4 rounded border ${item.completedAt ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-white"}`}
                                  />
                                  {item.label}
                                </button>
                              </form>
                            ))}
                          </div>
                        )}
                        <form
                          action={queueProjectArchive}
                          className="mt-2 grid gap-2"
                        >
                          <input
                            type="hidden"
                            name="projectId"
                            value={project.id}
                          />
                          <input
                            name="destinationPrefix"
                            defaultValue={`archive/org/${actor.organizationId}/projects/${project.id}`}
                            aria-label="Archive destination"
                            className={input}
                          />
                          <input
                            name="destinationReason"
                            placeholder="Reason if destination is changed"
                            className={input}
                          />
                          <Button type="submit" size="sm" variant="secondary">
                            <Archive size={14} /> Queue archive
                          </Button>
                        </form>
                        {archive && (
                          <p className="mt-2 text-xs text-zinc-600">
                            Latest archive: {archive.status}
                            {archive.failureDetail
                              ? ` · ${archive.failureDetail}`
                              : ""}
                          </p>
                        )}
                        <form action={closeProject} className="mt-2">
                          <input
                            type="hidden"
                            name="projectId"
                            value={project.id}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={archive?.status !== "SUCCEEDED"}
                          >
                            Close project
                          </Button>
                        </form>
                      </div>
                    )}
                  {actor.role === "MANAGER" &&
                    project.status === "COMPLETED" && (
                      <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <form action={reopenProject} className="grid gap-2">
                          <input
                            type="hidden"
                            name="projectId"
                            value={project.id}
                          />
                          <input
                            name="reason"
                            required
                            minLength={3}
                            placeholder="Safe reopen reason"
                            className={input}
                          />
                          <Button type="submit" size="sm" variant="secondary">
                            Reopen project
                          </Button>
                        </form>
                        <form action={saveRetrospective} className="grid gap-2">
                          <input
                            type="hidden"
                            name="projectId"
                            value={project.id}
                          />
                          <textarea
                            name="bottleneckSummary"
                            defaultValue={retro?.bottleneckSummary ?? ""}
                            placeholder="Bottleneck summary"
                            className="min-h-16 rounded-xl border border-emerald-200 p-3 text-sm"
                          />
                          <textarea
                            name="lessons"
                            defaultValue={
                              Array.isArray(retro?.lessons)
                                ? retro.lessons.join("\n")
                                : ""
                            }
                            placeholder="One structured lesson per line"
                            className="min-h-20 rounded-xl border border-emerald-200 p-3 text-sm"
                          />
                          <textarea
                            name="templateSuggestion"
                            placeholder="Optional template improvement suggestion"
                            className="min-h-16 rounded-xl border border-emerald-200 p-3 text-sm"
                          />
                          <Button type="submit" size="sm">
                            <CheckCircle2 size={14} /> Save retrospective
                          </Button>
                        </form>
                      </div>
                    )}
                </section>
              </div>
            </article>
          );
        })}
        {displayProjects.length === 0 && (
          <div className="surface rounded-2xl p-10 text-center text-sm text-zinc-500">
            No finance-scoped projects match this invoice filter.
          </div>
        )}
      </div>
      {actor.role === "MANAGER" &&
        allSuggestions.some(
          (item) =>
            item.status === "PROPOSED" &&
            allRetros.some(
              (retro) =>
                retro.id === item.retrospectiveId &&
                visibleIds.has(retro.projectId),
            ),
        ) && (
          <section className="surface mt-5 rounded-2xl p-5">
            <h2 className="display text-lg font-bold">
              Template improvement decisions
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Retrospective suggestions remain inert until a manager records a
              decision.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {allSuggestions
                .filter(
                  (item) =>
                    item.status === "PROPOSED" &&
                    allRetros.some(
                      (retro) =>
                        retro.id === item.retrospectiveId &&
                        visibleIds.has(retro.projectId),
                    ),
                )
                .map((item) => (
                  <form
                    key={item.id}
                    action={decideTemplateSuggestion}
                    className="rounded-xl bg-zinc-50 p-4"
                  >
                    <input type="hidden" name="suggestionId" value={item.id} />
                    <p className="text-sm font-semibold">{item.suggestion}</p>
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder="Decision reason"
                      className={`${input} mt-3 w-full`}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="submit"
                        name="decision"
                        value="APPROVED"
                        size="sm"
                      >
                        Approve
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="REJECTED"
                        size="sm"
                        variant="secondary"
                      >
                        Reject
                      </Button>
                    </div>
                  </form>
                ))}
            </div>
          </section>
        )}
    </>
  );
}
