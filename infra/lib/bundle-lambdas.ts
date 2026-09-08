import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Bundles a Lambda handler with esbuild and returns the JS as a string.
 *
 * Used by `CognitoUserPoolConstruct` to feed `Code.fromInline`.
 */
export function bundleLambdaHandler(
  entryPoint: string,
  libRoot: string,
  external: string[] = ["@aws-sdk/*", "uuid"],
): string {
  const result = buildSync({
    entryPoints: [join(libRoot, entryPoint)],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    external,
    write: false,
    sourcemap: "inline",
    banner: {
      js: "import { createRequire as __crq } from 'module'; const require = __crq(import.meta.url);",
    },
  });
  if (result.outputFiles.length === 0) {
    throw new Error(`bundleLambdaHandler: esbuild produced no output for ${entryPoint}`);
  }
  return result.outputFiles[0].text;
}

/**
 * Reads a file and returns its contents. Convenience helper for the test
 * suite that asserts handler source code contains specific literals.
 */
export function readLambdaSource(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}
