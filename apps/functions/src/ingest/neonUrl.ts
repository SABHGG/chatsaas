import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Resolves the Neon connection string for the ingest Lambda (ADR-008).
 *
 * The connection string lives in SSM Parameter Store as a SecureString named
 * `chatsaas-{env}-neon-url`; the Lambda receives only the parameter *name* via
 * env (`NEON_URL_PARAMETER_NAME`) and reads the value at runtime with a
 * least-privilege `ssm:GetParameter` (decrypt) grant. The value is cached per
 * parameter name for the execution environment's lifetime.
 *
 * Local/sandbox convenience: when `NEON_DATABASE_URL` is set in the
 * environment (gitignored .env), it short-circuits SSM — floci cannot emulate
 * Neon, so sandbox ingest goes straight to the real Neon dev project.
 */
const cache = new Map<string, string>();

export async function resolveNeonUrl(parameterName: string): Promise<string> {
  const cached = cache.get(parameterName);
  if (cached) return cached;

  const direct = process.env.NEON_DATABASE_URL;
  if (direct) {
    cache.set(parameterName, direct);
    return direct;
  }

  const client = new SSMClient({});
  const out = await client.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = out.Parameter?.Value;
  if (!value) {
    throw new Error(
      `SSM parameter ${parameterName} is missing or empty (SecureString Neon URL)`,
    );
  }
  cache.set(parameterName, value);
  return value;
}
