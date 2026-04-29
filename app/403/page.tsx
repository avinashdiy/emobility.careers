import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
      <div className="max-w-md text-center">
        <div className="mb-4 text-6xl">🔒</div>
        <h1 className="text-2xl font-extrabold text-emce-text">Access denied</h1>
        <p className="mt-2 text-emce-text-sec">
          You don&apos;t have permission to view this page. Sign in with the right account or
          head back home.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild>
            <Link href="/signin">Switch account</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
