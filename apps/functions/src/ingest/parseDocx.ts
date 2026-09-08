import { createRequire } from "node:module";
import { Buffer } from "node:buffer";

const require = createRequire(import.meta.url);
const mammoth: { extractRawText: (buf: Buffer) => Promise<{ value: string; messages: unknown[] }> } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("mammoth");

/**
 * @internal exposed for tests; production code calls `parseDocx` below.
 */
export interface ParseDocxDeps {
  mammoth: { extractRawText: (buf: Buffer) => Promise<{ value: string; messages: unknown[] }> }
}

export async function parseDocx(
  buffer: Buffer,
  deps: ParseDocxDeps = { mammoth }
): Promise<string> {
  if (buffer.length === 0) {
    throw new Error("parseDocx: empty buffer");
  }
  const result = await deps.mammoth.extractRawText(buffer);
  return result.value.trim();
}
