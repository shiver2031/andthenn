import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFilesystemStorage } from "./local-storage";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("LocalFilesystemStorage", () => {
  it("accepts a valid local ticket and verifies checksum, persistence, and byte ranges", async () => {
    const root = await mkdtemp(join(tmpdir(), "andthenn-prototype-storage-")); directories.push(root);
    const provider = new LocalFilesystemStorage(root, "http://127.0.0.1:3000", "test-secret");
    const bytes = new TextEncoder().encode("prototype media");
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const upload = await provider.initiateUpload({ organizationId: "org", taskId: "task", fileVersionId: "version", filename: "clip.mp4", contentType: "video/mp4", sizeBytes: bytes.byteLength, checksumSha256 });
    const ticket = new URL(upload.uploadUrl!).pathname.split("/").at(-1)!;
    await provider.putTicket(ticket, bytes);
    const finalized = await provider.finalizeUpload({ organizationId: "org", taskId: "task", fileVersionId: "version", filename: "clip.mp4", contentType: "video/mp4", sizeBytes: bytes.byteLength, checksumSha256, uploadId: upload.uploadId });
    const range = await provider.openRead(finalized.objectKey, "bytes=0-8");
    expect(range.contentRange).toBe(`bytes 0-8/${bytes.byteLength}`);
    expect(new TextDecoder().decode(await new Response(range.body).arrayBuffer())).toBe("prototype");
  });

  it("rejects altered and oversized uploads", async () => {
    const root = await mkdtemp(join(tmpdir(), "andthenn-prototype-storage-")); directories.push(root);
    const provider = new LocalFilesystemStorage(root, "http://127.0.0.1:3000", "test-secret");
    await expect(provider.initiateUpload({ organizationId: "org", taskId: "task", fileVersionId: "version", filename: "large.mov", contentType: "video/quicktime", sizeBytes: 10 * 1024 * 1024 + 1, checksumSha256: "a".repeat(64) })).rejects.toThrow("10 MB");
    expect(provider.verifyTicket("altered.ticket")).toBeNull();
  });
});
