"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to client-side error reporter if you wire Sentry later.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
      <div className="max-w-md text-center">
        <div className="mb-4 text-6xl">⚠️</div>
        <h1 className="text-2xl font-extrabold text-emce-text">Something went wrong</h1>
        <p className="mt-2 text-emce-text-sec">
          We hit an unexpected error. The team has been notified.
        </p>
        {error.digest && (
          <p className="mt-2 text-hint text-emce-text-muted">
            Error ID: <code>{error.digest}</code>
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={reset}>Try again</Button>
          <Button asChild><Link href="/">Go home</Link></Button>
        </div>
      </div>
    </main>
  );
}
