import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

// Workhorse humanist sans for body and data.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Machined label voice: jack labels, URLs, embed code.
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-operators-ivory font-sans text-slate-ink antialiased">
        {children}
      </body>
    </html>
  )
}
