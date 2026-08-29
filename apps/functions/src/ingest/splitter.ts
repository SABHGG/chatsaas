import { createHash } from "node:crypto";
import type { Chunk } from "./types.js";

/**
 * Splits text into chunks sized for Bedrock Titan v2. Each chunk carries
 * its own SHA-256 so the IngestLambda can dedupe at insert time.
 *
 * The implementation is a recursive character splitter that tries
 * paragraph / sentence / word / character boundaries in that order. The
 * LangChain @langchain/textsplitters package would do the same thing but
 * adds a dependency we do not need for the 4-line algorithm.
 *
 * The overlap is the trailing `chunkOverlap` characters of the previous
 * chunk, prepended to the next one. That gives the embedding model
 * cross-boundary context at the cost of a small amount of duplicate text.
 */
export interface SplitOptions {
  chunkSize: number;
  chunkOverlap: number;
}

const SEPARATORS = ["\n\n", "\n", ". ", " ", ""] as const;

export function splitText(content: string, opts: SplitOptions): Chunk[] {
  if (content.length === 0) {
    return [];
  }
  const raw = splitRecursive(content, opts, 0);
  // Re-index from 0 and compute SHA-256 per chunk.
  return raw.map((text, index) => ({
    index,
    content: text,
    contentSha256: new Uint8Array(createHash("sha256").update(text).digest()),
  }));
}

function splitRecursive(
  text: string,
  opts: SplitOptions,
  depth: number,
): string[] {
  if (text.length <= opts.chunkSize) {
    return [text];
  }
  const sep = SEPARATORS[Math.min(depth, SEPARATORS.length - 1)];
  if (sep === "") {
    // Character split fallback.
    const out: string[] = [];
    for (let i = 0; i < text.length; i += opts.chunkSize) {
      out.push(text.slice(i, i + opts.chunkSize));
    }
    return out;
  }
  // Split on the separator and recombine adjacent pieces until the chunk
  // hits the size limit. Apply the overlap to the start of each new chunk.
  const pieces = text.split(sep);
  const chunks: string[] = [];
  let buffer = "";
  for (const piece of pieces) {
    const next = buffer.length === 0 ? piece : buffer + sep + piece;
    if (next.length <= opts.chunkSize) {
      buffer = next;
      continue;
    }
    // Flush `buffer` as a chunk and start the next with overlap.
    if (buffer.length > 0) {
      chunks.push(buffer);
      const overlap = buffer.slice(Math.max(0, buffer.length - opts.chunkOverlap));
      buffer = overlap.length > 0 ? overlap + sep + piece : piece;
    } else {
      // The piece alone is bigger than chunkSize; recurse.
      const sub = splitRecursive(piece, opts, depth + 1);
      if (sub.length > 1) {
        // Prepend overlap from the last emitted chunk to the first sub-chunk
        // so the chain stays continuous.
        const overlap =
          chunks.length > 0
            ? chunks[chunks.length - 1].slice(
                Math.max(0, chunks[chunks.length - 1].length - opts.chunkOverlap),
              )
            : "";
        for (let i = 0; i < sub.length - 1; i++) {
          chunks.push(sub[i]);
        }
        const last = sub[sub.length - 1];
        buffer =
          overlap.length > 0 && last.length + sep.length + overlap.length <= opts.chunkSize
            ? overlap + sep + last
            : last;
      } else {
        buffer = piece;
      }
    }
  }
  if (buffer.length > 0) {
    chunks.push(buffer);
  }
  return chunks;
}
