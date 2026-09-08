import { createRequire } from "node:module";
import { Buffer } from "node:buffer";

/**
 * PDF text extraction. `pdf-parse` is CJS-only and ships without a
 * TypeScript-friendly default export; we use `createRequire` to load it
 * under ESM.
 *
 * Returns one string per page. Pages with no extractable text (scanned
 * PDFs without an OCR layer) return an empty string and the caller drops
 * them.
 */
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> =
  // pdf-parse's main module IS the parse function; it also has a debug
  // "test/data/..." lookup that runs when require.main is missing. Importing
  // via require() instead of the test entry avoids that.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("pdf-parse");

/**
 * @internal exposed for tests; production code calls `parsePdf` below.
 */
export interface ParsePdfDeps {
  pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }>
}

/**
 * Pure splitter. Used by both the live path and the tests.
 */
export function splitPdfPages(raw: { text: string; numpages: number }): string[] {
  const pages = raw.text.split("\f");
  // Drop trailing empty page from the form-feed split.
  while (pages.length > 0 && pages[pages.length - 1].trim() === "") {
    pages.pop();
  }
  return pages.map((p) => p.trim());
}

export async function parsePdf(
  buffer: Buffer,
  deps: ParsePdfDeps = { pdfParse }
): Promise<string[]> {
  if (buffer.length === 0) {
    throw new Error("parsePdf: empty buffer");
  }
  const result = await deps.pdfParse(buffer);
  return splitPdfPages(result);
}
