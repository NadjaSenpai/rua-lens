import { Gunzip, Inflate } from "fflate";
import { createExpansionBudget, type ExpansionBudget } from "./limits";
import { IngestError, isIngestError } from "./xml-security";

export type ReportCandidate = {
  sourceFileName: string;
  entryName: string | null;
  xml: Uint8Array;
};

type ZipEntry = {
  name: string;
  flags: number;
  crc32: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  directory: boolean;
};

const GZIP_MAGIC = [0x1f, 0x8b];
const ZIP_LOCAL_FILE_MAGIC = 0x04034b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_MAGIC = 0x02014b50;
const COPY_CHUNK_BYTES = 64 * 1024;
const CRC32_TABLE = createCrc32Table();

export async function* extractReportCandidates(
  file: File,
  budget: ExpansionBudget = createExpansionBudget(),
): AsyncIterable<ReportCandidate> {
  if (file.size > budget.limits.maxInputBytesPerFile) {
    throw new IngestError("SIZE_LIMIT_EXCEEDED");
  }

  const input = await readFileBytes(file, budget.limits.maxInputBytesPerFile);
  if (isGzip(input)) {
    const xml = decompressGzip(input, budget);
    if (!isXml(inputStart(xml))) {
      throw new IngestError("UNSUPPORTED_FORMAT");
    }
    yield { sourceFileName: file.name, entryName: null, xml };
    return;
  }

  if (isZip(input)) {
    const entries = parseZipEntries(input, budget);
    let archiveExpandedBytes = 0;

    for (const entry of entries) {
      if (entry.directory || !entry.name.toLowerCase().endsWith(".xml")) {
        continue;
      }
      if (entry.uncompressedSize > budget.limits.maxXmlBytes) {
        throw new IngestError("SIZE_LIMIT_EXCEEDED");
      }

      const xml = decompressZipEntry(input, entry, budget, (chunkLength) => {
        archiveExpandedBytes += chunkLength;
        if (archiveExpandedBytes > budget.limits.maxArchiveExpansionBytes) {
          throw new IngestError("SIZE_LIMIT_EXCEEDED");
        }
      });
      if (!isXml(inputStart(xml))) {
        continue;
      }
      yield { sourceFileName: file.name, entryName: entry.name, xml };
    }
    return;
  }

  if (!isXml(inputStart(input))) {
    throw new IngestError("UNSUPPORTED_FORMAT");
  }
  consumeExpansion(input.byteLength, budget);
  if (input.byteLength > budget.limits.maxXmlBytes) {
    throw new IngestError("SIZE_LIMIT_EXCEEDED");
  }
  yield { sourceFileName: file.name, entryName: null, xml: input };
}

async function readFileBytes(file: File, maximumBytes: number): Promise<Uint8Array> {
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > maximumBytes) {
        throw new IngestError("SIZE_LIMIT_EXCEEDED");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return joinChunks(chunks, length);
}

function decompressGzip(input: Uint8Array, budget: ExpansionBudget): Uint8Array {
  if (input.byteLength < 18) {
    throw new IngestError("INVALID_ARCHIVE");
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  let completed = false;

  try {
    const gunzip = new Gunzip((chunk, final) => {
      length = appendExpandedChunk(chunks, length, chunk, budget, undefined);
      completed = final;
    });

    for (let offset = 0; offset < input.length; offset += COPY_CHUNK_BYTES) {
      const end = Math.min(offset + COPY_CHUNK_BYTES, input.length);
      gunzip.push(input.subarray(offset, end), end === input.length);
    }
  } catch (error) {
    rethrowArchiveError(error);
  }

  if (!completed) {
    throw new IngestError("INVALID_ARCHIVE");
  }
  return joinChunks(chunks, length);
}

function parseZipEntries(input: Uint8Array, budget: ExpansionBudget): ZipEntry[] {
  try {
    const endOfCentralDirectory = findEndOfCentralDirectory(input);
    const diskNumber = readUint16(input, endOfCentralDirectory + 4);
    const centralDirectoryDisk = readUint16(input, endOfCentralDirectory + 6);
    const entriesOnDisk = readUint16(input, endOfCentralDirectory + 8);
    const totalEntries = readUint16(input, endOfCentralDirectory + 10);
    const centralDirectorySize = readUint32(input, endOfCentralDirectory + 12);
    const centralDirectoryOffset = readUint32(input, endOfCentralDirectory + 16);

    if (
      diskNumber !== 0 ||
      centralDirectoryDisk !== 0 ||
      entriesOnDisk !== totalEntries ||
      totalEntries > budget.limits.maxZipEntries ||
      centralDirectoryOffset + centralDirectorySize > input.length
    ) {
      throw new IngestError("INVALID_ARCHIVE");
    }

    const entries: ZipEntry[] = [];
    let offset = centralDirectoryOffset;
    for (let index = 0; index < totalEntries; index += 1) {
      if (readUint32(input, offset) !== ZIP_CENTRAL_DIRECTORY_MAGIC) {
        throw new IngestError("INVALID_ARCHIVE");
      }
      const flags = readUint16(input, offset + 8);
      const compressionMethod = readUint16(input, offset + 10);
      const crc32 = readUint32(input, offset + 16);
      const compressedSize = readUint32(input, offset + 20);
      const uncompressedSize = readUint32(input, offset + 24);
      const fileNameLength = readUint16(input, offset + 28);
      const extraLength = readUint16(input, offset + 30);
      const commentLength = readUint16(input, offset + 32);
      const localHeaderOffset = readUint32(input, offset + 42);
      const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength;
      if (nextOffset > input.length || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
        throw new IngestError("INVALID_ARCHIVE");
      }

      const name = normalizeZipEntryName(decodeZipName(input.subarray(offset + 46, offset + 46 + fileNameLength)));
      if ((flags & 0x1) !== 0) {
        throw new IngestError("INVALID_ARCHIVE");
      }
      entries.push({
        name,
        flags,
        crc32,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        directory: name.endsWith("/"),
      });
      offset = nextOffset;
    }

    if (offset !== centralDirectoryOffset + centralDirectorySize) {
      throw new IngestError("INVALID_ARCHIVE");
    }
    return entries;
  } catch (error) {
    rethrowArchiveError(error);
  }
}

function decompressZipEntry(
  input: Uint8Array,
  entry: ZipEntry,
  budget: ExpansionBudget,
  consumeArchiveBytes: (length: number) => void,
): Uint8Array {
  try {
    const localOffset = entry.localHeaderOffset;
    if (readUint32(input, localOffset) !== ZIP_LOCAL_FILE_MAGIC) {
      throw new IngestError("INVALID_ARCHIVE");
    }
    const localFlags = readUint16(input, localOffset + 6);
    const localMethod = readUint16(input, localOffset + 8);
    const fileNameLength = readUint16(input, localOffset + 26);
    const extraLength = readUint16(input, localOffset + 28);
    const dataOffset = localOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataOffset + entry.compressedSize;
    if (
      (localFlags & 0x1) !== 0 ||
      localMethod !== entry.compressionMethod ||
      dataEnd > input.length
    ) {
      throw new IngestError("INVALID_ARCHIVE");
    }

    const compressed = input.subarray(dataOffset, dataEnd);
    const chunks: Uint8Array[] = [];
    let length = 0;
    let crc32 = 0xffffffff;
    const append = (chunk: Uint8Array) => {
      crc32 = updateCrc32(crc32, chunk);
      length = appendExpandedChunk(chunks, length, chunk, budget, consumeArchiveBytes);
    };

    if (entry.compressionMethod === 0) {
      for (let offset = 0; offset < compressed.length; offset += COPY_CHUNK_BYTES) {
        append(compressed.subarray(offset, Math.min(offset + COPY_CHUNK_BYTES, compressed.length)));
      }
    } else if (entry.compressionMethod === 8) {
      let completed = false;
      const inflater = new Inflate((chunk, final) => {
        append(chunk);
        completed = final;
      });
      for (let offset = 0; offset < compressed.length; offset += COPY_CHUNK_BYTES) {
        const end = Math.min(offset + COPY_CHUNK_BYTES, compressed.length);
        inflater.push(compressed.subarray(offset, end), end === compressed.length);
      }
      if (!completed) {
        throw new IngestError("INVALID_ARCHIVE");
      }
    } else {
      throw new IngestError("INVALID_ARCHIVE");
    }

    if (length !== entry.uncompressedSize || ((crc32 ^ 0xffffffff) >>> 0) !== entry.crc32) {
      throw new IngestError("INVALID_ARCHIVE");
    }
    return joinChunks(chunks, length);
  } catch (error) {
    rethrowArchiveError(error);
  }
}

function appendExpandedChunk(
  chunks: Uint8Array[],
  currentLength: number,
  chunk: Uint8Array,
  budget: ExpansionBudget,
  consumeArchiveBytes: ((length: number) => void) | undefined,
): number {
  const nextLength = currentLength + chunk.byteLength;
  if (nextLength > budget.limits.maxXmlBytes) {
    throw new IngestError("SIZE_LIMIT_EXCEEDED");
  }
  consumeExpansion(chunk.byteLength, budget);
  consumeArchiveBytes?.(chunk.byteLength);
  chunks.push(chunk);
  return nextLength;
}

function consumeExpansion(length: number, budget: ExpansionBudget): void {
  budget.expandedBytes += length;
  if (budget.expandedBytes > budget.limits.maxBatchExpansionBytes) {
    throw new IngestError("SIZE_LIMIT_EXCEEDED");
  }
}

function findEndOfCentralDirectory(input: Uint8Array): number {
  const minimumOffset = Math.max(0, input.length - 65_557);
  for (let offset = input.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(input, offset) === ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC) {
      const commentLength = readUint16(input, offset + 20);
      if (offset + 22 + commentLength === input.length) {
        return offset;
      }
    }
  }
  throw new IngestError("INVALID_ARCHIVE");
}

function normalizeZipEntryName(rawName: string): string {
  if (
    rawName.length === 0 ||
    rawName.includes("\0") ||
    rawName.includes("\\") ||
    rawName.startsWith("/") ||
    rawName.startsWith("\\") ||
    /^[a-z]:/i.test(rawName)
  ) {
    throw new IngestError("INVALID_ARCHIVE");
  }

  const slashName = rawName.replaceAll("\\", "/");
  const trailingSlash = slashName.endsWith("/");
  const parts = slashName.split("/");
  if (parts.some((part) => part === "..")) {
    throw new IngestError("INVALID_ARCHIVE");
  }
  const normalizedParts = parts.filter((part) => part !== "" && part !== ".");
  if (normalizedParts.length === 0 || normalizedParts.some((part) => part === "..")) {
    throw new IngestError("INVALID_ARCHIVE");
  }
  return `${normalizedParts.join("/")}${trailingSlash ? "/" : ""}`;
}

function decodeZipName(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new IngestError("INVALID_ARCHIVE");
  }
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
}

function updateCrc32(crc: number, chunk: Uint8Array): number {
  let updated = crc;
  for (const byte of chunk) {
    updated = (updated >>> 8) ^ CRC32_TABLE[(updated ^ byte) & 0xff];
  }
  return updated >>> 0;
}

function readUint16(input: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > input.length) {
    throw new IngestError("INVALID_ARCHIVE");
  }
  return input[offset] | (input[offset + 1] << 8);
}

function readUint32(input: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > input.length) {
    throw new IngestError("INVALID_ARCHIVE");
  }
  return (
    input[offset] |
    (input[offset + 1] << 8) |
    (input[offset + 2] << 16) |
    (input[offset + 3] << 24)
  ) >>> 0;
}

function joinChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function inputStart(input: Uint8Array): Uint8Array {
  let offset = 0;
  if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    offset = 3;
  }
  while (offset < input.length && [0x09, 0x0a, 0x0d, 0x20].includes(input[offset])) {
    offset += 1;
  }
  return input.subarray(offset);
}

function isXml(input: Uint8Array): boolean {
  return input[0] === 0x3c;
}

function isGzip(input: Uint8Array): boolean {
  return input[0] === GZIP_MAGIC[0] && input[1] === GZIP_MAGIC[1];
}

function isZip(input: Uint8Array): boolean {
  return readZipMagic(input) === ZIP_LOCAL_FILE_MAGIC || readZipMagic(input) === ZIP_END_OF_CENTRAL_DIRECTORY_MAGIC;
}

function readZipMagic(input: Uint8Array): number | null {
  if (input.length < 4) {
    return null;
  }
  return readUint32(input, 0);
}

function rethrowArchiveError(error: unknown): never {
  if (isIngestError(error)) {
    throw error;
  }
  throw new IngestError("INVALID_ARCHIVE");
}
