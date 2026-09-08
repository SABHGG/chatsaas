import { extractText } from "unpdf";
import { Buffer } from "node:buffer";

/**
 * PDF text extraction via `unpdf` (bundled modern pdfjs serverless build).
 *
 * Replaces `pdf-parse@1.1.1`, whose 2018-era bundled pdf.js chokes on
 * Flate-compressed streams ("Unknown compression method in flate stream")
 * that current PDF generators emit.
 *
 * Returns one string per page, already trimmed. Pages with no extractable
 * text return an empty string and the caller drops them.
 */

/**
 * @internal exposed for tests; production code calls `parsePdf` below.
 * Mirrors unpdf's `extractText(pdf, { mergePages: false })` return shape.
 */
export interface ParsePdfDeps {
  extractText: (pdf: Uint8Array) => Promise<{ totalPages: number; text: string[] }>
}

/**
 * Page-wise normalizer. Used by both the live path and the tests.
 */
export function normalizePages(pages: string[]): string[] {
  return pages.map((p) => p.trim());
}

export async function parsePdf(
  buffer: Buffer,
  deps: ParsePdfDeps = { extractText }
): Promise<string[]> {
  if (buffer.length === 0) {
    throw new Error("parsePdf: empty buffer");
  }
  const result = await deps.extractText(new Uint8Array(buffer));
  return normalizePages(result.text);
}
