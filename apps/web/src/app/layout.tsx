import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

// Workhorse humanist sans for body and data; exposed as --font-sans so
// the shadcn token set (@theme inline) resolves to it.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Mono voice for code, URLs, and the embed snippet.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'chatSaaS — The Operator\u2019s Board',
  description: 'Managed document-grounded AI chatbots. Plug a question into your knowledge; the line goes live.',
}

/**
 * The committed visual world, shipped with the build so no audit has to
 * trust the source tree alone. React cannot emit a bare comment node as
 * <body>'s first child, so the contract rides in a hidden, aria-hidden
 * element there — the seed key (561c7af6) lands in the rendered HTML.
 */
const WORLD_CONTRACT = `<!-- THESIS: The operator's board is a control-tower strip rack: every chatbot line is a paper strip clipped in strict order; pulling a strip opens its workspace.
OWN-WORLD: cool rack-metal gray ground, warm paper strips, near-black ink, ONE inscription-red accent (the live stamp and the NEW LINE lever); typewriter mono readouts, grotesk prose; squared corners; state carried by stamp, dash and doubling - never by hue alone.
STORY: the owner scans every line's state at a glance, pulls one strip to work it, files new lines through the flight-plan wizard, reads plan charges as tower entries.
FIRST VIEWPORT: full-height rack of strips left; the selected strip pulled out into the workspace right; the NEW LINE lever bottom-left, the only red control at rest.
FORM: ATC flight-strip rack - candidate 6 of 7 grounded, seed key 561c7af6.
FINISH: this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. -->`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: WORLD_CONTRACT }} />
        {children}
      </body>
    </html>
  )
}
