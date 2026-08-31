interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

/**
 * Operator sign-in. Starts the OAuth2 authorization-code + PKCE flow via
 * the /api/auth/login route handler, which mints state + PKCE before
 * redirecting to Cognito.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams

  const loginHref = next
    ? `/api/auth/login?next=${encodeURIComponent(next)}`
    : '/api/auth/login'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="rounded-card border border-hairline-slate bg-panel-warm px-8 py-10">
        <h1 className="font-mono text-sm font-medium uppercase tracking-plate text-slate-ink">
          Operator sign-in
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-ink">
          Plug in to manage your lines. Your chatbots, your documents, your
          plan — all on one quiet board.
        </p>
        {error ? (
          <p className="mt-4 text-sm leading-relaxed text-slate-ink" role="alert">
            Sign-in didn&rsquo;t go through. Give it another try.
          </p>
        ) : null}
        <a
          href={loginHref}
          className="mt-8 inline-flex items-center justify-center rounded-plug bg-slate-ink px-6 py-3 font-mono text-sm font-medium uppercase tracking-plate text-operators-ivory hover:bg-slate-ink/90"
        >
          Sign in
        </a>
      </div>
    </main>
  )
}
