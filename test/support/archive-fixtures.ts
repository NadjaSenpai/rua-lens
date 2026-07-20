import { gzipSync, zipSync } from "fflate";

const encoder = new TextEncoder();

export function xmlBytes(xml: string): Uint8Array {
  return encoder.encode(xml);
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export function xmlFile(name: string, xml: string): File {
  return new File([blobPart(xmlBytes(xml))], name, { type: "application/octet-stream" });
}

export function gzipFile(name: string, xml: string): File {
  return new File([blobPart(gzipSync(xmlBytes(xml)))], name, { type: "application/octet-stream" });
}

export function zipFile(name: string, entries: Record<string, string | Uint8Array>): File {
  const encodedEntries: Record<string, Uint8Array> = {};
  for (const [entryName, entry] of Object.entries(entries)) {
    encodedEntries[entryName] = typeof entry === "string" ? xmlBytes(entry) : entry;
  }
  return new File([blobPart(zipSync(encodedEntries))], name, { type: "application/octet-stream" });
}

export function encryptedZipFile(name: string, entries: Record<string, string>): File {
  const bytes = new Uint8Array(zipSync(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, xmlBytes(value)]))));
  for (let offset = 0; offset + 10 <= bytes.length; offset += 1) {
    const signature = readUint32(bytes, offset);
    if (signature === 0x04034b50) {
      bytes[offset + 6] |= 1;
    } else if (signature === 0x02014b50) {
      bytes[offset + 8] |= 1;
    }
  }
  return new File([blobPart(bytes)], name, { type: "application/octet-stream" });
}

export function crcCorruptedZipFile(name: string, entries: Record<string, string>): File {
  const bytes = new Uint8Array(zipSync(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, xmlBytes(value)]))));
  for (let offset = 0; offset + 20 <= bytes.length; offset += 1) {
    if (readUint32(bytes, offset) === 0x02014b50) {
      bytes[offset + 16] ^= 1;
      return new File([blobPart(bytes)], name, { type: "application/octet-stream" });
    }
  }
  throw new Error("fixture ZIP did not contain a central-directory entry");
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
