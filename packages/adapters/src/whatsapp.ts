import { createHmac, timingSafeEqual } from "node:crypto";
import type { NormalizedWhatsAppMessage, WhatsAppProvider } from "@andthenn/domain";

interface WhatsAppConfig { appSecret: string; accessToken: string; phoneNumberId: string; graphVersion?: string; }

export class MetaWhatsAppAdapter implements WhatsAppProvider {
  constructor(private readonly config: WhatsAppConfig) {}

  async verifyWebhook(signature: string, rawBody: Uint8Array) {
    const expected = `sha256=${createHmac("sha256", this.config.appSecret).update(rawBody).digest("hex")}`;
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  async normalizeWebhook(payload: unknown) {
    const normalized: NormalizedWhatsAppMessage[] = [];
    const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<Record<string, unknown>> } }> }> }).entry ?? [];
    for (const entry of entries) for (const change of entry.changes ?? []) for (const message of change.value?.messages ?? []) {
      const kind = String(message.type ?? "").toUpperCase();
      const media = message[String(message.type)] as { id?: string; filename?: string } | undefined;
      normalized.push({
        providerMessageId: String(message.id),
        senderNumber: String(message.from),
        sentAt: new Date(Number(message.timestamp) * 1_000),
        kind: (["TEXT", "AUDIO", "IMAGE", "DOCUMENT"] as const).includes(kind as never) ? kind as NormalizedWhatsAppMessage["kind"] : "UNSUPPORTED",
        text: (message.text as { body?: string } | undefined)?.body ?? null,
        mediaId: media?.id ?? null,
        sequenceKey: `${String(message.from)}:${String(message.timestamp)}:${String(message.id)}`,
      });
    }
    return normalized.sort((a, b) => a.sequenceKey.localeCompare(b.sequenceKey));
  }

  private endpoint(path = "messages") {
    return `https://graph.facebook.com/${this.config.graphVersion ?? "v23.0"}/${this.config.phoneNumberId}/${path}`;
  }

  async retrieveMedia(mediaId: string) {
    const metadata = await fetch(`https://graph.facebook.com/${this.config.graphVersion ?? "v23.0"}/${mediaId}`, { headers: { Authorization: `Bearer ${this.config.accessToken}` } });
    if (!metadata.ok) throw new Error(`WhatsApp media lookup failed: ${metadata.status}`);
    const { url, mime_type } = await metadata.json() as { url: string; mime_type: string };
    const media = await fetch(url, { headers: { Authorization: `Bearer ${this.config.accessToken}` } });
    if (!media.ok) throw new Error(`WhatsApp media download failed: ${media.status}`);
    return { bytes: new Uint8Array(await media.arrayBuffer()), contentType: mime_type, filename: null };
  }

  async sendConfirmed(input: { recipient: string; message: string; reviewUrl: string }) {
    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: input.recipient, type: "text", text: { body: `${input.message}\n${input.reviewUrl}` } }),
    });
    if (!response.ok) throw new Error(`WhatsApp send failed: ${response.status}`);
    const body = await response.json() as { messages?: Array<{ id: string }> };
    const providerMessageId = body.messages?.[0]?.id;
    if (!providerMessageId) throw new Error("WhatsApp send returned no message ID");
    return { providerMessageId };
  }
}
