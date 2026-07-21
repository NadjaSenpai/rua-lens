import { gzipSync, zipSync } from "fflate";

const encoder = new TextEncoder();
const BOUNDARY = "----=_Part_test_boundary";

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export type MimeAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

export function buildRawEmail(options: {
  from?: string;
  to?: string;
  subject?: string;
  textBody?: string;
  attachments: MimeAttachment[];
}): Uint8Array {
  const from = options.from ?? "noreply@google.com";
  const to = options.to ?? "dmarc@example.com";
  const subject = options.subject ?? "Report Domain: example.com";

  const parts: string[] = [];

  if (options.textBody) {
    parts.push(
      `--${BOUNDARY}\r\n` +
      `Content-Type: text/plain; charset="utf-8"\r\n\r\n` +
      `${options.textBody}\r\n`,
    );
  }

  for (const attachment of options.attachments) {
    const base64 = encodeBase64(attachment.content);
    parts.push(
      `--${BOUNDARY}\r\n` +
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n` +
      `Content-Disposition: attachment; filename="${attachment.filename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${base64}\r\n`,
    );
  }

  const mime =
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/mixed; boundary="${BOUNDARY}"\r\n\r\n` +
    parts.join("") +
    `--${BOUNDARY}--\r\n`;

  return encoder.encode(mime);
}

export function xmlAttachment(filename: string, xml: string): MimeAttachment {
  return { filename, contentType: "application/xml", content: encoder.encode(xml) };
}

export function gzipAttachment(filename: string, xml: string): MimeAttachment {
  return { filename, contentType: "application/gzip", content: gzipSync(encoder.encode(xml)) };
}

export function zipAttachment(filename: string, entries: Record<string, string>): MimeAttachment {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) {
    encoded[name] = encoder.encode(content);
  }
  return { filename, contentType: "application/zip", content: new Uint8Array(zipSync(encoded)) };
}
