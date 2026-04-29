import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MentorProfileForm } from "@/components/mentorship/MentorProfileForm";
import { MentorKycPanel } from "@/components/mentorship/MentorKycPanel";
import { getMentorByUserId } from "@/server/mentorship/queries";

export const metadata = { title: "My mentor profile" };

export default async function MyMentorPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/mentor");

  const [mentor, evDomains] = await Promise.all([
    getMentorByUserId(session.user.id),
    db.eVDomain.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true } }),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-4xl space-y-4 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">Mentor on eMobility Careers</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Set up your mentor profile, get approved, then start earning by helping the next wave of EV professionals.
            </p>
          </div>
          {mentor?.isPublished && (
            <Button asChild variant="outline">
              <Link href="/me/mentor/sessions">Booking inbox →</Link>
            </Button>
          )}
        </div>

        <MentorKycPanel
          kycStatus={mentor?.kycStatus ?? "DRAFT"}
          isPublished={mentor?.isPublished ?? false}
          rejectionNote={mentor?.kycRejectionNote ?? null}
          hasProfile={Boolean(mentor)}
        />

        <MentorProfileForm
          initial={{
            headline: mentor?.headline,
            bio: mentor?.bio,
            expertiseTags: mentor?.expertiseTags,
            evDomainSlugs: mentor?.evDomainSlugs,
            languages: mentor?.languages,
            yearsExperience: mentor?.yearsExperience,
            pricePerSessionMinor: mentor?.pricePerSessionMinor,
            currency: mentor?.currency,
            acceptingFree: mentor?.acceptingFree,
            acceptingPaid: mentor?.acceptingPaid,
            sessionDurations: mentor?.sessionDurations,
            bufferMinutes: mentor?.bufferMinutes,
            defaultMode: mentor?.defaultMode,
          }}
          evDomains={evDomains}
        />

        {mentor && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-section text-emce-text">Availability</h2>
                <p className="text-sm text-emce-text-sec">Define your weekly hours and one-off date overrides.</p>
              </div>
              <Button asChild>
                <Link href="/me/mentor/availability">Edit availability →</Link>
              </Button>
            </div>
          </Card>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
