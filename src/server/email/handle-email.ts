import PostalMime from "postal-mime";
import type { RuntimeEnv } from "../env";
import { parseStorageMode } from "../env";
import { createPrincipal } from "../auth/principal";
import { ingestBatch } from "../ingest/ingest-batch";

const DMARC_CONTENT_TYPES = new Set([
  "application/xml",
  "text/xml",
  "application/gzip",
  "application/zip",
  "application/x-zip-compressed",
]);

const DMARC_EXTENSIONS = [".xml", ".xml.gz", ".gz", ".zip"];

function isDmarcAttachment(attachment: { mimeType: string; filename: string | null }): boolean {
  if (DMARC_CONTENT_TYPES.has(attachment.mimeType)) {
    return true;
  }
  const name = attachment.filename?.toLowerCase() ?? "";
  return DMARC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function toBlobPart(content: ArrayBuffer | Uint8Array | string): ArrayBuffer {
  if (typeof content === "string") {
    return Uint8Array.from(new TextEncoder().encode(content)).buffer;
  }
  return Uint8Array.from(content instanceof Uint8Array ? content : new Uint8Array(content)).buffer;
}

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: RuntimeEnv,
  ctx: ExecutionContext,
): Promise<void> {
  void ctx;
  try {
    const storageMode = parseStorageMode(env);
    if (storageMode === "stateless") {
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    const qualifying = (parsed.attachments ?? []).filter(isDmarcAttachment);
    if (qualifying.length === 0) {
      return;
    }

    const files = qualifying.map((attachment) => {
      const content = toBlobPart(attachment.content);
      return new File([content], attachment.filename ?? "attachment", {
        type: attachment.mimeType,
      });
    });

    const principal = createPrincipal("email-ingest@rua-lens", []);

    const result = await ingestBatch({
      files,
      principal,
      db: env.DB,
      storageMode: "d1",
    });

    console.log(
      `Email ingest from=${message.from}: inserted=${result.summary.inserted} duplicate=${result.summary.duplicate} rejected=${result.summary.rejected}`,
    );
  } catch (error) {
    console.error("Email ingest failed:", error);
  }
}
