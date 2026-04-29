import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { getMentorByUserId } from "@/server/mentorship/queries";
import { AvailabilityEditor } from "@/components/mentorship/AvailabilityEditor";

export const metadata = { title: "Mentor availability" };

export default async function MentorAvailabilityPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/mentor/availability");
  const mentor = await getMentorByUserId(session.user.id);
  if (!mentor) redirect("/me/mentor");

  return (
    <div className="container max-w-3xl space-y-4 py-6 md:py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-dashboard text-emce-text md:text-3xl">Availability</h1>
          <p className="mt-1 text-sm text-emce-text-sec">Set your hours so mentees can book sessions.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/me/mentor">← Back</Link>
        </Button>
      </div>
      <AvailabilityEditor rules={mentor.availabilityRules} />
    </div>
  );
}
