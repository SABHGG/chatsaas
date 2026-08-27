// Nombres de tabla DynamoDB (matching .env local config)
export const TABLES = {
  CHAT_MESSAGES: "chat-messages",
  CREDITS: "credits",
  PLANS: "plans",
  SUBSCRIPTIONS: "subscriptions",
  CONTENT: "content",
} as const;

// Tipos de tabla - estructura de cada item en DynamoDB

// 1. Tabla de mensajes de chat público
export type ChatMessage = {
  id: string; // UUID or DynamoDB key
  content: string;
  username?: string | null;
  createdAt: number; // timestamp
  userId?: string; // opcional, quien lo publicó
};

// 2. Tabla de créditos del usuario
export type CreditBalance = {
  userId: string;
  balance: number;
  updatedAt: number;
};

// 3. Tabla de planes disponibles
export type Plan = {
  id: string;
  name: string;
  price: number;
  features: string[];
  createdAt: number;
};

// 4. Tabla de suscripciones de usuario
export type UserSubscription = {
  userId: string;
  planId: string;
  status: "active" | "canceled" | "expired";
  startedAt: number;
  endsAt?: number;
};

// 5. Tabla de contenido publicado
export type PublishedContent = {
  id: string;
  title: string;
  message: string;
  authorId: string;
  createdAt: number;
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
