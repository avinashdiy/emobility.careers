import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
      <div className="max-w-md text-center">
        <div className="mb-4 text-6xl">⚡</div>
        <h1 className="text-2xl font-extrabold text-emce-text">Page not found</h1>
        <p className="mt-2 text-emce-text-sec">
          We couldn&apos;t find the page you&apos;re looking for. It may have been moved or no longer exists.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline"><Link href="/">Go home</Link></Button>
          <Button asChild><Link href="/jobs">Browse jobs →</Link></Button>
        </div>
      </div>
    </main>
  );
}
