"use client";

import { Badge, Button } from "@andthenn/ui";
import {
  CheckCircle2,
  Copy,
  FileUp,
  Link2,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  approveFileVersion,
  createAssetRight,
  createReviewShare,
  reopenFileApproval,
  resolveReviewComment,
  revokeReviewShare,
} from "../app/(erp)/tasks/review-actions";

type Version = {
  id: string;
  versionNumber: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  processingStatus: string;
  lockedAt: Date | null;
  fileAssetId: string;
};
type Asset = { id: string; logicalName: string; versions: Version[] };
type Share = {
  id: string;
  fileVersionId: string;
  status: string;
  expiresAt: Date | null;
  recipient: string | null;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
};
type Comment = {
  id: string;
  body: string;
  reviewerName: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};
type Right = {
  id: string;
  fileAssetId: string;
  kind: string;
  territory: string;
  channels: string[];
  validUntil: string | null;
};

export function TaskReviewHub({
  taskId,
  taskVersion,
  activeApproval,
  assets,
  shares,
  comments,
  rights,
  canShare,
  canApprove,
  canManageRights,
}: {
  taskId: string;
  taskVersion: number;
  activeApproval: { id: string; fileVersionId: string } | null;
  assets: Asset[];
  shares: Share[];
  comments: Comment[];
  rights: Right[];
  canShare: boolean;
  canApprove: boolean;
  canManageRights: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const readyVersions = assets
    .flatMap((asset) => asset.versions)
    .filter((version) => version.processingStatus === "READY");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setMessage("Computing checksum…");
    try {
      const checksum = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const initiated = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId,
          fileAssetId: String(data.get("fileAssetId") || "") || null,
          logicalName: String(data.get("logicalName") || file.name),
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          checksumSha256: checksum,
        }),
      });
      const session = (await initiated.json()) as {
        error?: string;
        uploadId?: string;
        mode?: "SINGLE" | "MULTIPART";
        uploadUrl?: string;
        parts?: { partNumber: number; uploadUrl: string }[];
      };
      if (!initiated.ok || !session.uploadId)
        throw new Error(session.error ?? "Unable to start upload");
      setMessage(
        session.mode === "MULTIPART"
          ? `Uploading ${session.parts?.length ?? 0} retry-safe parts…`
          : "Uploading file…",
      );
      const completedParts: { partNumber: number; etag: string }[] = [];
      if (session.mode === "MULTIPART" && session.parts) {
        const partSize = 8 * 1024 * 1024;
        for (const part of session.parts) {
          const response = await fetch(part.uploadUrl, {
            method: "PUT",
            body: file.slice(
              (part.partNumber - 1) * partSize,
              Math.min(part.partNumber * partSize, file.size),
            ),
          });
          if (!response.ok)
            throw new Error(
              `Upload part ${part.partNumber} failed; retry the upload`,
            );
          const etag = response.headers.get("etag");
          if (!etag) throw new Error("Storage did not return a multipart ETag");
          completedParts.push({ partNumber: part.partNumber, etag });
        }
      } else {
        if (!session.uploadUrl)
          throw new Error("Storage did not return an upload URL");
        const response = await fetch(session.uploadUrl, {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-amz-meta-sha256": checksum,
            "x-amz-meta-file-version-id": session.uploadId,
          },
          body: file,
        });
        if (!response.ok)
          throw new Error("Storage upload failed; retry the upload");
      }
      const completed = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadId: session.uploadId,
          fileVersionId: session.uploadId,
          checksumSha256: checksum,
          sizeBytes: file.size,
          idempotencyKey: `upload:${session.uploadId}`,
          ...(completedParts.length ? { parts: completedParts } : {}),
        }),
      });
      const result = (await completed.json()) as { error?: string };
      if (!completed.ok)
        throw new Error(result.error ?? "Unable to complete upload");
      setMessage(
        "Upload complete. Validation and media processing are queued.",
      );
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function share(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createReviewShare(new FormData(form));
        setShareUrl(result.url);
        setMessage("Version-pinned review link created.");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to create share",
        );
      }
    });
  }

  return (
    <section className="surface mt-5 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-500">
            Phase 4
          </p>
          <h2 className="display mt-1 text-xl font-bold">Files and review</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Immutable versions, pinned shares, feedback state and usage rights.
          </p>
        </div>
        <Badge tone={readyVersions.length ? "green" : "amber"}>
          {readyVersions.length} ready version
          {readyVersions.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <form
            onSubmit={upload}
            className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-4"
          >
            <h3 className="text-sm font-bold">Upload a version</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                name="logicalName"
                required
                maxLength={300}
                placeholder="Asset name"
                className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
              />
              <select
                name="fileAssetId"
                className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
              >
                <option value="">New asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    New version of {asset.logicalName}
                  </option>
                ))}
              </select>
              <input
                name="file"
                type="file"
                required
                className="min-h-11 rounded-xl border border-zinc-200 bg-white p-2 text-sm sm:col-span-2"
              />
              <Button
                type="submit"
                disabled={busy}
                className="min-h-11 sm:col-span-2"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <FileUp size={16} />
                )}{" "}
                Upload
              </Button>
            </div>
          </form>
          {assets.map((asset) => (
            <article
              key={asset.id}
              className="rounded-2xl border border-zinc-100 p-4"
            >
              <h3 className="text-sm font-bold">{asset.logicalName}</h3>
              <div className="mt-3 space-y-2">
                {asset.versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-3 text-xs"
                  >
                    <span className="font-bold">V{version.versionNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-500">
                      {version.filename}
                    </span>
                    <Badge
                      tone={
                        version.processingStatus === "READY"
                          ? "green"
                          : version.processingStatus === "FAILED"
                            ? "rose"
                            : "amber"
                      }
                    >
                      {version.processingStatus}
                    </Badge>
                    {version.lockedAt && (
                      <ShieldCheck size={16} className="text-emerald-600" />
                    )}
                    {canApprove &&
                      version.processingStatus === "READY" &&
                      !version.lockedAt &&
                      !activeApproval && (
                        <form action={approveFileVersion}>
                          <input type="hidden" name="taskId" value={taskId} />
                          <input
                            type="hidden"
                            name="fileVersionId"
                            value={version.id}
                          />
                          <input
                            type="hidden"
                            name="expectedTaskVersion"
                            value={taskVersion}
                          />
                          <Button type="submit" size="sm">
                            Approve
                          </Button>
                        </form>
                      )}
                  </div>
                ))}
              </div>
            </article>
          ))}
          {canManageRights && activeApproval && (
            <form
              action={reopenFileApproval}
              className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
            >
              <input type="hidden" name="taskId" value={taskId} />
              <p className="text-xs font-bold text-amber-900">
                Approved version locked
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Reopening preserves the locked bytes and approval history while
                allowing new work.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  name="reason"
                  required
                  minLength={3}
                  placeholder="Reopen reason"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-amber-200 px-3 text-sm"
                />
                <Button type="submit" size="sm" variant="secondary">
                  Reopen approval
                </Button>
              </div>
            </form>
          )}
        </div>
        <div className="space-y-4">
          {canShare && (
            <form
              onSubmit={share}
              className="rounded-2xl border border-zinc-100 p-4"
            >
              <h3 className="text-sm font-bold">Create pinned review share</h3>
              <input type="hidden" name="taskId" value={taskId} />
              <select
                name="fileVersionId"
                required
                className="mt-3 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm"
              >
                <option value="">Choose ready version</option>
                {readyVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    V{version.versionNumber} · {version.filename}
                  </option>
                ))}
              </select>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  name="channel"
                  className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
                >
                  <option value="IN_APP">Copy link</option>
                  <option value="EMAIL">Send email</option>
                  <option value="WHATSAPP">Send WhatsApp</option>
                </select>
                <input
                  name="recipient"
                  maxLength={320}
                  placeholder="Recipient email or number"
                  className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
                />
                <input
                  name="expiresAt"
                  type="datetime-local"
                  className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
                />
                <textarea
                  name="message"
                  maxLength={4000}
                  placeholder="Editable share message"
                  className="min-h-20 rounded-xl border border-zinc-200 p-3 text-sm sm:col-span-2"
                />
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input name="downloadAllowed" type="checkbox" /> Allow
                  download
                </label>
                <Button
                  type="submit"
                  disabled={pending || !readyVersions.length}
                >
                  <Link2 size={16} /> Share version
                </Button>
              </div>
              {shareUrl && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3">
                  <input
                    readOnly
                    value={shareUrl}
                    className="min-w-0 flex-1 bg-transparent text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(shareUrl)}
                    className="grid size-11 place-items-center rounded-xl bg-white"
                    aria-label="Copy review link"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              )}
            </form>
          )}
          <div className="rounded-2xl border border-zinc-100 p-4">
            <h3 className="text-sm font-bold">Share history and views</h3>
            <div className="mt-3 space-y-2">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="rounded-xl bg-zinc-50 p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={share.status === "ACTIVE" ? "green" : "rose"}>
                      {share.status}
                    </Badge>
                    <span className="truncate text-zinc-500">
                      {share.recipient ?? "Copy link"}
                    </span>
                    {share.status === "ACTIVE" && canShare && (
                      <form action={revokeReviewShare} className="ml-auto">
                        <input type="hidden" name="taskId" value={taskId} />
                        <input type="hidden" name="shareId" value={share.id} />
                        <button
                          className="grid size-11 place-items-center rounded-xl text-rose-600"
                          aria-label="Revoke share"
                        >
                          <XCircle size={16} />
                        </button>
                      </form>
                    )}
                  </div>
                  <p className="mt-2 text-zinc-400">
                    {share.firstViewedAt
                      ? `First viewed ${new Date(share.firstViewedAt).toLocaleString()} · Last ${new Date(share.lastViewedAt!).toLocaleString()}`
                      : "Not viewed yet"}
                  </p>
                </div>
              ))}
              {!shares.length && (
                <p className="text-xs text-zinc-400">
                  No review links created.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-100 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Outstanding feedback</h3>
              <span className="flex gap-1">
                <a
                  href={`/api/tasks/${taskId}/feedback-export?format=csv`}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-violet-700"
                >
                  CSV
                </a>
                <a
                  href={`/api/tasks/${taskId}/feedback-export?format=pdf`}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-violet-700"
                >
                  PDF
                </a>
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {comments.map((comment) => (
                <form
                  key={comment.id}
                  action={resolveReviewComment}
                  className="rounded-xl bg-zinc-50 p-3"
                >
                  <input type="hidden" name="taskId" value={taskId} />
                  <input type="hidden" name="commentId" value={comment.id} />
                  <p className="text-xs font-bold">
                    {comment.reviewerName ?? "Reviewer"} ·{" "}
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">{comment.body}</p>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                  >
                    {comment.resolvedAt ? (
                      <>
                        <CheckCircle2 size={14} /> Reopen
                      </>
                    ) : (
                      "Resolve"
                    )}
                  </Button>
                </form>
              ))}
              {!comments.length && (
                <p className="text-xs text-zinc-400">No feedback yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      {canManageRights && assets.length > 0 && (
        <form
          action={createAssetRight}
          className="mt-5 rounded-2xl border border-zinc-100 p-4"
        >
          <h3 className="text-sm font-bold">Asset rights and releases</h3>
          <input type="hidden" name="taskId" value={taskId} />
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <select
              name="fileAssetId"
              required
              className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
            >
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.logicalName}
                </option>
              ))}
            </select>
            <input
              name="kind"
              required
              placeholder="License or release"
              className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <input
              name="territory"
              required
              placeholder="Territory"
              className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <input
              name="channels"
              required
              placeholder="Channels, comma separated"
              className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <input
              name="validFrom"
              type="date"
              className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <input
              name="validUntil"
              type="date"
              className="h-11 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <Button type="submit" className="md:col-span-3">
              <ShieldCheck size={16} /> Add rights record
            </Button>
          </div>
          {rights.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {rights.map((right) => (
                <Badge
                  key={right.id}
                  tone={
                    right.validUntil &&
                    right.validUntil < new Date().toISOString().slice(0, 10)
                      ? "rose"
                      : "cyan"
                  }
                >
                  {right.kind} · {right.territory}
                  {right.validUntil ? ` · until ${right.validUntil}` : ""}
                </Badge>
              ))}
            </div>
          )}
        </form>
      )}
      {message && (
        <p className="mt-4 text-xs text-zinc-500" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
