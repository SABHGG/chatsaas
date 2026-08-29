/**
 * Tiny structured JSON logger. Emits one JSON line per call.
 *
 * The IngestLambda runs asynchronously with no interactive session; structured
 * logs are the only way to follow a document through the pipeline. CloudWatch
 * Logs Insights queries key off `request_id`, `document_id`, `chatbot_id`,
 * and `company_id`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  request_id?: string;
  document_id?: string;
  chatbot_id?: string;
  company_id?: string;
  chunk_index?: number;
  embedding_model_id?: string;
  latency_ms?: number;
  error_class?: string;
  [k: string]: unknown;
}

function emit(level: LogLevel, message: string, context: LogContext = {}): void {
  const line = {
    level,
    message,
    ts: new Date().toISOString(),
    request_id:
      context.request_id ??
      (typeof process !== "undefined" ? process.env.AWS_LAMBDA_REQUEST_ID : undefined),
    ...context,
  };
  const text = JSON.stringify(line);
  if (level === "error" || level === "warn") {
    console.error(text);
  } else {
    console.log(text);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
