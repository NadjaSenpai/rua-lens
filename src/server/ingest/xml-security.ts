export type IngestErrorCode =
  | "INVALID_XML"
  | "NOT_DMARC_REPORT"
  | "EXCESSIVE_STRUCTURE"
  | "INVALID_ARCHIVE"
  | "UNSUPPORTED_FORMAT"
  | "SIZE_LIMIT_EXCEEDED";

const messages: Record<IngestErrorCode, string> = {
  INVALID_XML: "DMARC aggregate reportとして読み取れませんでした。",
  NOT_DMARC_REPORT: "DMARC aggregate reportではありません。",
  EXCESSIVE_STRUCTURE: "DMARC aggregate reportの構造が制限を超えています。",
  INVALID_ARCHIVE: "圧縮ファイルとして読み取れませんでした。",
  UNSUPPORTED_FORMAT: "対応していないファイル形式です。",
  SIZE_LIMIT_EXCEEDED: "ファイルが許容サイズを超えています。",
};

export class IngestError extends Error {
  readonly code: IngestErrorCode;

  constructor(code: IngestErrorCode) {
    super(messages[code]);
    this.name = "IngestError";
    this.code = code;
  }
}

export function isIngestError(error: unknown): error is IngestError {
  return error instanceof IngestError;
}

export function safeIngestMessage(code: IngestErrorCode): string {
  return messages[code];
}

export function decodeXml(xml: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(xml);
  } catch {
    throw new IngestError("INVALID_XML");
  }
}

export function assertSafeXmlMarkup(xml: string, maxDepth: number): void {
  let depth = 0;
  let cursor = 0;
  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open === -1) {
      return;
    }

    if (xml.startsWith("<!--", open)) {
      const close = xml.indexOf("-->", open + 4);
      if (close === -1) {
        throw new IngestError("INVALID_XML");
      }
      cursor = close + 3;
      continue;
    }

    if (xml.startsWith("<![CDATA[", open)) {
      const close = xml.indexOf("]]>", open + 9);
      if (close === -1) {
        throw new IngestError("INVALID_XML");
      }
      cursor = close + 3;
      continue;
    }

    const close = findTagEnd(xml, open + 1);
    if (close === -1) {
      throw new IngestError("INVALID_XML");
    }

    const tag = xml.slice(open + 1, close).trim();
    if (/^!\s*(?:doctype|entity)\b/i.test(tag)) {
      throw new IngestError("INVALID_XML");
    }
    if (tag.startsWith("/") && !tag.startsWith("//")) {
      depth -= 1;
      if (depth < 0) {
        throw new IngestError("INVALID_XML");
      }
    } else if (!tag.startsWith("?") && !tag.startsWith("!") && !tag.endsWith("/")) {
      depth += 1;
      if (depth > maxDepth) {
        throw new IngestError("EXCESSIVE_STRUCTURE");
      }
    }

    cursor = close + 1;
  }

  if (depth !== 0) {
    throw new IngestError("INVALID_XML");
  }
}

function findTagEnd(xml: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}
