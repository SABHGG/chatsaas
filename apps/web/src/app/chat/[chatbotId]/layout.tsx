import type { ReactNode } from 'react'
import './visitor.css'

/**
 * The visitor route's own layout: the "Ask-First Q&A Board" world ships
 * with its committed contract the same way the operator board does —
 * React cannot emit a bare comment node as the first child, so the
 * contract rides in a hidden, aria-hidden element and the seed key
 * (fb7dfcd1) lands in the rendered HTML.
 *
 * The wrapper carries the visitor world (`.vchat`, white ground, ink,
 * hairlines) so nothing of the operator's Flight-Strip tokens can leak
 * onto this surface.
 */
const VISITOR_CONTRACT = `<!-- THESIS: The visitor came for an answer, not a chat: a stack of answered documents — each question headed, each answer grounded, every answer carrying its sources footnoted to the same card; the composer leads.
OWN-WORLD: quiet neutral light of its own — white ground, ink near-black text, hairline dividers, ONE restrained accent that is NOT corporate blue (ink-black primary button; links underlined ink); generous readable type, flat materials, at most one soft lift shadow. NO rack/stamp/mono-instrument vocabulary from the operator world, no gradients, no neon, no dark surfaces.
STORY: the visitor lands, asks, reads a grounded answer with its sources one fold away, keeps asking; every failure tells the truth calmly and never blames the company.
FIRST VIEWPORT: bot name + a one-line "Answers from company documents" note, one generous composer front and center; answered questions stack beneath as document cards (question as small heading, answer as body, collapsible Sources (n) at the card foot); the newest card shows the thinking state while awaiting.
FORM: Ask-First Q&A board — dealt structure 4 of 7, seed key fb7dfcd1.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. -->`

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="vchat" data-testid="visitor-surface">
      <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: VISITOR_CONTRACT }} />
      {children}
    </div>
  )
}
