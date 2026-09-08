import type { CognitoAccessTokenClaims } from "../auth/claims.js";

/**
 * Public chat endpoint request body.
 * Strict shape: only `message` and optional `conversation_id` are accepted.
 * No client-supplied tenant fields are allowed.
 */
export interface ChatPublicRequest {
  message: string;
  conversation_id?: string;
}

export interface ChatPublicResponse {
  data: {
    answer: string;
    conversation_id: string;
    sources: Source[];
  };
}

export interface Source {
  id: string;
  content: string;
  score: number;
}

export interface ChatPublicError {
  error: string;
  details?: string;
  path: string;
  timestamp: string;
}

/**
 * Scope resolved from the chatbot row.
 * This is the ONLY trusted source of `company_id` on the public path.
 * The anonymous visitor has no JWT; tenant scope comes from the chatbot row.
 */
export interface ChatbotScope {
  chatbotId: string;
  companyId: string;
  status: "draft" | "published" | "archived";
  systemPrompt?: string;
  settings?: Record<string, unknown>;
}

/**
 * A retrieved chunk with its vector similarity score.
 */
export interface RetrievedChunk {
  id: string;
  content: string;
  score: number; // cosine distance from pgvector <=> operator
}

/**
 * Built prompt ready for Bedrock completion.
 */
export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * Bedrock completion result with exact token usage.
 */
export interface BedrockCompletion {
  answer: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}

/**
 * Persisted turn (user question + assistant answer).
 */
export interface PersistedTurn {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Conversation limit check result.
 */
export interface LimitCheckResult {
  allowed: boolean;
  reason?: "monthly_limit_exhausted" | "prepaid_credits_exhausted" | "no_active_subscription";
  creditsRemaining?: number;
  monthlyUsed?: number;
  monthlyLimit?: number;
  /** True when monthly usage crossed the 80% threshold (x-credit-alert header). */
  alert80?: boolean;
}

/**
 * Chatbot row shape in DynamoDB.
 */
export interface ChatbotRecord {
  id: string;
  companyId: string;
  ownerSub: string;
  name: string;
  status: "draft" | "published" | "archived";
  settings: {
    system_prompt?: string;
    model_id?: string;
    top_k?: number;
    temperature?: number;
    max_tokens?: number;
  };
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp set on first publish (WI-001). Absent on drafts. */
  publishedAt?: string;
  /** Plan the chatbot was published under (WI-001). Absent on drafts. */
  planId?: string;
}

/**
 * Error classes for typed error handling.
 */
export class RetrievalError extends Error {
  constructor(
    public readonly code:
      | "chatbot_not_found"
      | "chatbot_not_published"
      | "monthly_limit_exhausted"
      | "prepaid_credits_exhausted"
      | "no_active_subscription"
      | "bedrock_throttling"
      | "bedrock_validation"
      | "bedrock_access_denied"
      | "db_error"
      | "validation_error",
    message: string,
  ) {
    super(message);
    this.name = "RetrievalError";
  }
}