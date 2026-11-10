import Link from 'next/link';
import { Logo } from '@/components/layout/logo';

/** The branded 404 every CrossCubes site shows; each app passes where "home" is. */
export function NotFoundView({ homeHref = '/', homeLabel = 'Go to the home page' }: { homeHref?: string; homeLabel?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <Logo className="h-14 w-14" />
      <p className="display mt-8 text-7xl tabular-nums text-foreground">404</p>
      <h1 className="display mt-4 text-2xl text-foreground">This page doesn’t exist</h1>
      <p className="mt-3 text-muted-foreground">It may have moved, or the link may be mistyped.</p>
      <Link
        href={homeHref}
        className="mt-8 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {homeLabel}
      </Link>
    </div>
  );
}
