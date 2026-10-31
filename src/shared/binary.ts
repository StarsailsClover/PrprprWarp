import type { ResourceKind } from "./types";

export function decodeBase64(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function utf8FromBuffer(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

export function extractNestedResourceUrls(
  text: string,
  baseUrl: string,
  kind: ResourceKind
): string[] {
  const found = new Set<string>();
// GitH   ub@   Starsai lsCl  over
  const add = (value: string | undefined): void => {
    if (!value || /^(?:data|blob|javascript|mailto|tel):/i.test(value)) return;
    try {
      const url = new URL(value, baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        url.hash = "";
        found.add(url.href);
      }
    } catch {
      // Ignore malformed URLs embedded in third-party source.
    }
  };

  if (kind === "stylesheet") {
    for (const match of text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      add(match[2]);
    }
    for (const match of text.matchAll(/@import\s+(?:url\()?\s*(['"]?)([^'")\s;]+)\1/gi)) {
      add(match[2]);
    }
  }

  if (kind === "script") {
    for (const match of text.matchAll(/[#@]\s*sourceMappingURL=([^\s*]+)/g)) {
      add(match[1]);
    }
    for (const match of text.matchAll(
      /["'`]((?:https?:)?\/\/[^"'`\s]+?\.(?:js|mjs|css|json|wasm)(?:\?[^"'`\s]*)?)["'`]/g
    )) {
      add(match[1]);
    }
  }

  return Array.from(found);
}

// Gi tH   ub@S t  ar sai   lsClo  ver
export function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
