import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Button } from '@/components/ui/button'

/**
 * The marketing landing — the guest funnel at `/`.
 *
 * Root behavior: an authenticated operator is redirected server-side to
 * /board before anything renders; a guest reads the landing. A session
 * read failure degrades toward the landing (never a 500) — a broken
 * cookie must not kill the public face of the product.
 *
 * Copy language: SPANISH — an explicit founder decision (WI-010) that
 * overrides the PRODUCT.md English-UI rule for this surface only. The
 * world-contract guard exempts exactly this route group and nothing else.
 *
 * Visual language: the committed Flight-Strip world — rack-metal ground,
 * paper strips, ink, hairlines, mono instruments, squared corners. The
 * inscription red appears exactly ONCE at rest (the hero CTA, the
 * surface's one lever); every other control stays ink or hairline.
 * Pricing stays qualitative: limits, not numbers (PRODUCT.md leaves
 * pricing undecided), and no fabricated social proof.
 */

export const metadata: Metadata = {
  title: 'chatSaaS — Chatbots de IA entrenados con los documentos de tu empresa',
  description:
    'Crea un chatbot de IA con tus propios documentos y publícalo en minutos: una URL o un iframe para tu web. Sin tocar AWS, sin escribir código.',
}

const HERO_STATS = [
  { label: 'Pasos', value: '03' },
  { label: 'Líneas de código', value: '0' },
  { label: 'Toques a AWS', value: '0' },
] as const

const STEPS = [
  {
    number: '01',
    title: 'Crea tu chatbot',
    copy: 'Ponle un nombre — la mesa de atención, el servicio técnico, tu tienda. Un minuto, sin ninguna configuración técnica.',
  },
  {
    number: '02',
    title: 'Sube tus documentos',
    copy: 'Manuales, catálogos, políticas, precios: PDF, DOCX o texto. El bot aprende de lo que subes — no improvisa con lo que encuentra por ahí.',
  },
  {
    number: '03',
    title: 'Comparte la URL o el iframe',
    copy: 'Publica y comparte el enlace, o copia el iframe y pégalo en tu web. Tus clientes preguntan; el bot responde con tus documentos.',
  },
] as const

const BENEFITS = [
  {
    tag: 'Sin cloud',
    title: 'AWS, pero sin tocar AWS',
    copy: 'Toda la infraestructura la operamos nosotros. Tú ves documentos, bots y planes — nunca servidores.',
  },
  {
    tag: 'Con fundamento',
    title: 'Respuestas desde tus documentos',
    copy: 'El bot responde con lo que está en tus documentos, y si algo no está, lo dice en lugar de inventar.',
  },
  {
    tag: 'En minutos',
    title: 'Sin equipo técnico',
    copy: 'De registrarte a publicar sin ayuda de ingeniería: crear, subir y compartir es todo el trabajo.',
  },
  {
    tag: 'Sin sorpresas',
    title: 'Límites claros',
    copy: 'Planes con límites claros y créditos siempre visibles. Sabes dónde estás antes de quedarte sin nada.',
  },
] as const

const FAQS = [
  {
    question: '¿Necesito saber de AWS o de programación?',
    answer:
      'No. chatSaaS opera toda la infraestructura: tú solo creas el chatbot, subes documentos y compartes el enlace o el iframe.',
  },
  {
    question: '¿De dónde salen las respuestas?',
    answer:
      'De los documentos que subes. Y cuando la respuesta no está en ellos, el bot lo dice en lugar de inventar.',
  },
  {
    question: '¿Dónde puede vivir mi chatbot?',
    answer:
      'En un enlace público propio o embebido en tu web con un iframe. Sin widgets, sin instalaciones, sin depender de un desarrollador.',
  },
  {
    question: '¿Cuánto cuesta?',
    answer:
      'Trabajamos con planes mensuales con límites claros y créditos visibles — sin números escondidos. Estamos afinando los montos finales: escríbenos y te contamos.',
  },
] as const

export default async function LandingPage() {
  // Root gate: an authenticated operator never sees the marketing page —
  // the board is one redirect away. A session read failure degrades to
  // the landing (guest treatment), never a 500.
  let session: Awaited<ReturnType<typeof getSession>> = null
  try {
    session = await getSession()
  } catch {
    session = null
  }
  if (session) {
    redirect('/board')
  }

  return (
    <div lang="es">
      {/* ---- Header: wordmark + one quiet sign-in path ---- */}
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground hover:text-foreground/70"
          >
            chatSaaS
          </Link>
          <Button asChild variant="outline">
            <Link href="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* ---- Hero: the value prop, one red lever ---- */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-16 sm:pt-24">
          <p className="label-mono text-muted-foreground">
            Chatbots de IA para tu empresa
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            Un chatbot de IA entrenado con los documentos de tu empresa.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Súbelos, publícalo y compártelo con una URL o un iframe — en
            minutos y sin escribir código. La infraestructura corre por nuestra
            cuenta: <strong className="font-medium text-foreground">sin tocar AWS</strong>.
          </p>

          {/* The one red control at rest on this surface — the lever to the
              sign-in log. Everything else stays ink or hairline. */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild variant="stamp" size="lg" className="label-mono px-4" data-testid="landing-cta-signin">
              <Link href="/login">Crear mi chatbot</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#como-funciona">Ver cómo funciona</a>
            </Button>
          </div>

          {/* The instrument row: product facts in the typewriter voice —
              figures, never marketing hype. */}
          <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-5">
            {HERO_STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="label-mono text-muted-foreground">{stat.label}</dt>
                <dd className="readout-mono mt-1 text-xl text-foreground">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---- How it works: three filed strips ---- */}
        <section
          id="como-funciona"
          aria-labelledby="how-title"
          className="mx-auto w-full max-w-5xl px-6 py-14 sm:py-16"
        >
          <p className="label-mono text-muted-foreground">Cómo funciona</p>
          <h2 id="how-title" className="mt-3 max-w-xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            De cero a tu chatbot en tres pasos.
          </h2>

          <ol className="mt-8 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.number}
                className="flex flex-col gap-3 border border-border bg-card p-5 text-card-foreground"
              >
                <span className="readout-mono text-sm text-muted-foreground">{step.number}</span>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Benefits: the brand promise, section by section ---- */}
        <section aria-labelledby="why-title" className="mx-auto w-full max-w-5xl px-6 py-14 sm:py-16">
          <p className="label-mono text-muted-foreground">Por qué chatSaaS</p>
          <h2 id="why-title" className="mt-3 max-w-xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Tu conocimiento, en línea, sin la parte difícil.
          </h2>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <li
                key={benefit.tag}
                className="flex flex-col gap-2 border border-border bg-card p-5 text-card-foreground"
              >
                <span className="label-mono text-muted-foreground">{benefit.tag}</span>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {benefit.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{benefit.copy}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- FAQ + the honest proof placeholder ---- */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full max-w-5xl px-6 py-14 sm:py-16">
          <p className="label-mono text-muted-foreground">Preguntas frecuentes</p>
          <h2 id="faq-title" className="mt-3 max-w-xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Lo que preguntan antes de crear su chatbot.
          </h2>

          <dl className="mt-8 max-w-3xl divide-y divide-border border-y border-border">
            {FAQS.map((faq) => (
              <div key={faq.question} className="py-4">
                <dt className="text-sm font-semibold text-foreground">{faq.question}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>

          {/* The proof slot: unfilled, honestly. No logos, no quotes, no
              invented numbers — the empty strip waits for real cases. */}
          <div
            data-testid="landing-proof-placeholder"
            className="mt-10 flex max-w-3xl flex-col gap-2 border border-dashed border-border bg-card/50 p-5"
          >
            <span className="label-mono text-muted-foreground">Casos reales — próximamente</span>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
              Estamos en los primeros días: no publicamos logos ni testimonios
              que todavía no existen. Cuando una empresa estrene su línea, su
              historia irá aquí.
            </p>
          </div>
        </section>

        {/* ---- Final CTA: ink, not red — the red lever was spent at the
                hero, one per surface ---- */}
        <section aria-labelledby="cta-title" className="mx-auto w-full max-w-5xl px-6 pb-20 pt-6">
          <div className="flex flex-col items-start gap-5 border border-border bg-card p-8 text-card-foreground sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <h2 id="cta-title" className="max-w-md text-2xl font-semibold tracking-tight text-foreground">
                Tu chatbot puede estar en vivo hoy.
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Crea la línea, sube tus documentos y comparte el enlace. Todo
                en una tarde, sin equipos técnicos.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0" data-testid="landing-cta-signin-end">
              <Link href="/login">Crear mi chatbot</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* ---- Footer: quiet, mono, no invented links ---- */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">chatSaaS</p>
            <p className="label-mono mt-1 text-muted-foreground">La centralita de tus chatbots</p>
          </div>
          <nav aria-label="Pie de página" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#como-funciona" className="text-sm text-muted-foreground hover:text-foreground">
              Cómo funciona
            </a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground">
              Preguntas frecuentes
            </a>
            <a
              href="mailto:support@chatsaas.app?subject=chatSaaS"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Contacto
            </a>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Iniciar sesión
            </Link>
          </nav>
        </div>
        <div className="mx-auto w-full max-w-5xl px-6 pb-8">
          <p className="readout-mono border-t border-border pt-4 text-xs text-muted-foreground">
            © 2026 chatSaaS
          </p>
        </div>
      </footer>
    </div>
  )
}
