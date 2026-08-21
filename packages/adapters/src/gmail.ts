import { GoogleAuth } from "google-auth-library";
import type { InboundEmailProvider, NormalizedEmail } from "@andthenn/domain";

interface GmailConfig {
  delegatedUser: string;
  pubsubTopic: string;
  labelIds?: string[];
  credentials?: Record<string, unknown>;
}

interface GmailHeader { name: string; value: string; }
interface GmailPart {
  filename?: string;
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
}

export class GmailIntakeAdapter implements InboundEmailProvider {
  private readonly auth: GoogleAuth;

  constructor(private readonly config: GmailConfig) {
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  }

  private async request<T>(path: string, init?: RequestInit) {
    const client = await this.auth.getClient();
    const headers = await client.getRequestHeaders();
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(this.config.delegatedUser)}/${path}`, {
      ...init,
      headers: { ...Object.fromEntries(headers.entries()), "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) throw new Error(`Gmail request failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<T>;
  }

  private watch() {
    return this.request<{ historyId: string; expiration: string }>("watch", {
      method: "POST",
      body: JSON.stringify({ topicName: this.config.pubsubTopic, labelIds: this.config.labelIds ?? ["INBOX"] }),
    }).then((value) => ({ historyCursor: value.historyId, expiresAt: new Date(Number(value.expiration)) }));
  }

  subscribe() { return this.watch(); }
  renew() { return this.watch(); }

  private flatten(part: GmailPart): GmailPart[] {
    return [part, ...(part.parts?.flatMap((child) => this.flatten(child)) ?? [])];
  }

  private decode(data?: string) {
    return data ? Buffer.from(data, "base64url").toString("utf8") : "";
  }

  private async fetchMessage(id: string): Promise<NormalizedEmail> {
    const value = await this.request<{ id: string; internalDate: string; payload: GmailPart }>(`messages/${id}?format=full`);
    const headers = Object.fromEntries((value.payload.headers ?? []).map((entry) => [entry.name.toLowerCase(), entry.value]));
    const parts = this.flatten(value.payload);
    return {
      providerMessageId: value.id,
      rfcMessageId: headers["message-id"] ?? null,
      sender: headers.from ?? "Unknown sender",
      recipients: (headers.to ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      forwardedBy: headers["x-forwarded-for"] ?? null,
      subject: headers.subject ?? "(no subject)",
      sentAt: new Date(Number(value.internalDate)),
      rawHeaders: headers,
      text: parts.filter((part) => part.mimeType === "text/plain").map((part) => this.decode(part.body?.data)).join("\n"),
      attachments: parts.filter((part) => Boolean(part.filename && part.body?.attachmentId)).map((part) => ({
        filename: part.filename!, contentType: part.mimeType ?? "application/octet-stream",
        providerAttachmentId: part.body!.attachmentId!, sizeBytes: part.body?.size ?? 0,
      })),
    };
  }

  async reconcile(historyCursor: string) {
    const value = await this.request<{ historyId: string; history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }> }>(`history?startHistoryId=${encodeURIComponent(historyCursor)}&historyTypes=messageAdded`);
    const ids = [...new Set((value.history ?? []).flatMap((entry) => entry.messagesAdded ?? []).map((entry) => entry.message.id))];
    return { nextCursor: value.historyId, messages: await Promise.all(ids.map((id) => this.fetchMessage(id))) };
  }

  async fetchRaw(providerMessageId: string) {
    const value = await this.request<{ raw: string }>(`messages/${providerMessageId}?format=raw`);
    return new Uint8Array(Buffer.from(value.raw, "base64url"));
  }

  async sendReview(input: { recipient: string; subject: string; message: string; reviewUrl: string }) {
    const encodedSubject = Buffer.from(input.subject).toString("base64");
    const raw = [
      `To: ${input.recipient}`,
      `Subject: =?UTF-8?B?${encodedSubject}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      `${input.message}\n\n${input.reviewUrl}`,
    ].join("\r\n");
    const result = await this.request<{ id: string }>("messages/send", { method: "POST", body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }) });
    return { providerMessageId: result.id };
  }
}
