import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmployerShell } from "@/components/layout/employer-shell";
import { EventEditor } from "@/components/events/EventEditor";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/events/new");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer?.companyId) redirect("/employer/onboarding");

  return (
    <EmployerShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <header className="mb-6">
          <Link href="/employer/events" className="text-xs font-bold text-emce-dark hover:underline">
            ← Events
          </Link>
          <h1 className="mt-2 text-dashboard text-emce-text md:text-3xl">New event</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Save it as a draft first, fill in details, then flip the status to OPEN to publish.
          </p>
        </header>
        <EventEditor />
      </div>
    </EmployerShell>
  );
}
