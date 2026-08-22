---
type: business
project_state: ai-assisted
generated_by: kaddo-bootstrap
template_version: 1
refined_by: bootstrap-agent
---

# Business Context

## Problem

Companies without cloud expertise need to offer an AI chatbot grounded in their own documents,
but assembling and operating the required AWS infrastructure is complex and costly to learn.

## Users

- Primary: company staff responsible for launching a customer-facing chatbot, without AWS
  infrastructure expertise.
- Secondary: visitors to the company's website who ask the chatbot questions.

## Business goals

- Let a company create a public, document-grounded chatbot without manually provisioning AWS
  infrastructure.
- Validate that a shareable public chat experience provides useful answers from company documents.

## Constraints

- chatSaaS pays for the AWS infrastructure and sells a monthly subscription plan with defined usage
  limits to each company.
- The initial subscription plan limits monthly conversations, the number of chatbots, and the volume
  of documents processed.
- Each company can enable or disable additional usage credits. If disabled, the product stops
  accepting new chatbot conversations when the monthly conversation limit is reached.
- The MVP excludes chatbots for authenticated employees, agency multi-client management, external
  system actions, webhooks, and a JavaScript widget.

## Open Questions

- [deferred] What numeric limits, price, payment method, and overage policy will apply to the initial
  subscription plan?
  - note: The plan limits monthly conversations, chatbot count, and document-processing volume;
    exact values are not required to define the initial public-chatbot outcome.
- [deferred] What is the exact price per prepaid conversation credit, minimum purchase amount, credit
  expiration policy, and refund policy?
  - note: Credits are purchased in advance, shown in the admin panel with alerts at 80% and 100%, and
    deducted per resolved conversation, not per message.
