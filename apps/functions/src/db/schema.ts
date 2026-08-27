// Nombres de tabla DynamoDB (matching .env local config)
export const TABLES = {
  CHAT_MESSAGES: "chat-messages",
  CREDITS: "credits",
  PLANS: "plans",
  SUBSCRIPTIONS: "subscriptions",
  CONTENT: "content",
} as const;

// Tipos de tabla - estructura de cada item en DynamoDB
// Timestamps are stored as ISO 8601 strings (UTC) to match what the
// handlers write via `new Date().toISOString()`. The response schemas
// also declare `format: 'date-time'`, so consumers can parse them
// directly with `new Date(value)`.

// 1. Tabla de mensajes de chat público
export type ChatMessage = {
  id: string; // UUID or DynamoDB key
  content: string;
  username?: string | null;
  createdAt: string; // ISO 8601 timestamp
  userId?: string; // opcional, quien lo publicó
  type: string; // 'text' today, room for future variants
};

// 2. Tabla de créditos del usuario
export type CreditBalance = {
  userId: string;
  balance: number;
  createdAt?: string;
  updatedAt: string;
};

// 3. Tabla de planes disponibles
export type Plan = {
  id: string;
  name: string;
  price: number;
  features?: string[];
  interval: 'monthly' | 'yearly' | string;
  active?: boolean;
  createdAt?: string;
};

// 4. Tabla de suscripciones de usuario
export type UserSubscription = {
  id?: string;
  userId: string;
  planId: string;
  status: "active" | "canceled" | "expired";
  startedAt: string;
  currentPeriodEnd: string;
  updatedAt?: string;
};

// 5. Tabla de contenido publicado
export type PublishedContent = {
  id: string;
  title: string;
  message: string;
  authorId: string;
  createdAt: string;
  status: "draft" | "published" | "archived";
};

// Índices y claves primarias sugeridas para DynamoDB

// Clave de partición y clave de clasificación para cada tabla
export const SCHEMA = {
  // chat-messages: PK=userId, SK=createdAt (para listing ordenado)
  chatMessages: {
    partitionKey: "userId",
    sortKey: "createdAt",
  },
  // credits: PK=userId (único por usuario)
  credits: {
    partitionKey: "userId",
  },
  // plans: PK=id (simple lookup)
  plans: {
    partitionKey: "id",
  },
  // subscriptions: PK=userId, SK=planId
  subscriptions: {
    partitionKey: "userId",
    sortKey: "planId",
  },
  // content: PK=id
  content: {
    partitionKey: "id",
  },
};
