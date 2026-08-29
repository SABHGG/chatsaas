import { Buffer } from "node:buffer";

/**
 * Plain-text / markdown read. UTF-8 decode, strip BOM, normalize line
 * endings to LF. The splitter handles chunking.
 */
export function parseText(buffer: Buffer, _mimeType: string): string {
  if (buffer.length === 0) {
    throw new Error("parseText: empty buffer");
  }
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  text = text.replace(/\r\n?/g, "\n");
  return text.trim();
}
