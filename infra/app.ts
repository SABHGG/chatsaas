#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ChatSaaSStack } from "./lib/chat-saas-stack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new App();

// Load local dev context from cdk.context.json if it exists. This lets the stack be
// synthesized without AWS access (sandbox / vitest / CI). In a real deploy, the CDK CLI
// also reads this file.
const contextFile = path.join(__dirname, "cdk.context.json");
if (fs.existsSync(contextFile)) {
  const ctx = JSON.parse(fs.readFileSync(contextFile, "utf-8"));
  for (const [k, v] of Object.entries(ctx)) {
    app.node.setContext(k, v);
  }
}

new ChatSaaSStack(app, "ChatSaaSStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  description: "chatSaaS dev stack: Neon pgvector vector store + ingest pipeline + Cognito identity",
});
