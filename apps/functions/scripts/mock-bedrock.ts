/**
 * Local Bedrock Runtime mock for the sandbox. Floci's Bedrock stub always
 * returns {"outputs":[{"text":"Floci stub response"}]}, which satisfies
 * neither Titan embeddings (`embedding` array) nor Claude completions, so
 * the WI-006 public chat route cannot run end-to-end against it.
 *
 * This mock answers InvokeModel with deterministic, spec-shaped bodies:
 *  - `amazon.titan-embed-*`  -> {"embedding": [<1024 deterministic floats>]}
 *  - `anthropic.*` (chat)    -> Anthropic messages response with usage
 *
 * Usage (in apps/functions/.env):
 *   AWS_ENDPOINT_URL_BEDROCK_RUNTIME=http://localhost:4567
 *
 * Run:  pnpm exec tsx scripts/mock-bedrock.ts
 */
import http from 'node:http'
import http2 from 'node:http2'
import type { IncomingMessage, ServerResponse } from 'node:http'

const PORT = Number(process.env.MOCK_BEDROCK_PORT ?? 4567)
const TITAN_DIMS = 1024

/** Deterministic pseudo-embedding: hash the text so the same question always
 *  yields the same vector (useful when debugging retrieval ordering). */
function embed(text: string): number[] {
  const vec = new Array<number>(TITAN_DIMS).fill(0)
  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) * 31 + i) % TITAN_DIMS
    vec[idx] += ((text.charCodeAt(i) % 97) + 1) / 100
  }
  return vec.map((v) => Number(v.toFixed(6)))
}

// The AWS SDK negotiates HTTP/2 with Bedrock Runtime, so serve both h2c and
// HTTP/1.1 on the same port (http2.createServer with allowHTTP1).
const handler = (req: IncomingMessage, res: ServerResponse) => {
  let body = ''
  req.on('data', (c: string) => (body += c))
  req.on('end', () => {
    const modelId = decodeURIComponent(req.url?.split('/')[2] ?? '')
    console.log(`[mock-bedrock] ${req.method} ${req.url} model=${modelId}`)

    const send = (code: number, payload: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    }

    if (modelId.startsWith('amazon.titan-embed')) {
      // Mirror Titan v2's two request shapes: single {inputText} or the
      // batched array of {inputText} — and answer with the matching response
      // shape (single object vs array of objects), since
      // ingest/embedBedrock.ts parses both.
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        parsed = null
      }
      const items = Array.isArray(parsed) ? parsed : [parsed]
      const responses = items.map((item) => {
        const text =
          typeof (item as { inputText?: unknown })?.inputText === 'string'
            ? (item as { inputText: string }).inputText
            : ''
        return { embedding: embed(text), inputTextTokenCount: text.length }
      })
      return send(200, Array.isArray(parsed) ? responses : responses[0])
    }

    if (modelId.includes('anthropic')) {
      let prompt = ''
      try {
        const parsed = JSON.parse(body) as { messages?: Array<{ content?: unknown }> }
        const last = parsed.messages?.at(-1)?.content
        prompt = typeof last === 'string' ? last : JSON.stringify(last ?? '')
      } catch {
        /* ignore */
      }
      void prompt
      return send(200, {
        id: 'msg_mock_001',
        type: 'message',
        role: 'assistant',
        model: modelId,
        content: [{ type: 'text', text: '[mock] Respuesta de prueba del chat local.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 8 },
      })
    }

    send(400, { message: `mock-bedrock: unsupported modelId ${modelId}` })
  })
}

const server = http2.createServer({ allowHTTP1: true }, handler)
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-bedrock] listening on http://localhost:${PORT}`)
})
