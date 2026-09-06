import { Button } from '@/components/ui/button'

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
      {/* The sign-in log: plain paper on the rack-metal ground, one
          control, no decoration. */}
      <div className="border border-border bg-card px-8 py-10 text-card-foreground">
        <h1 className="label-mono text-muted-foreground">
          Operator sign-in
        </h1>
        <p className="mt-6 text-base leading-relaxed text-foreground">
          Plug in to manage your lines. Your chatbots, your documents, your
          plan — all on one quiet board.
        </p>
        {error ? (
          <p className="mt-4 text-sm leading-relaxed text-destructive" role="alert">
            Sign-in didn&rsquo;t go through. Give it another try.
          </p>
        ) : null}
        <Button asChild className="mt-8 w-full">
          <a href={loginHref}>Sign in</a>
        </Button>
      </div>
    </main>
  )
}
